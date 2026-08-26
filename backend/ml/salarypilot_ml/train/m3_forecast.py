"""
M3 - Cash-flow forecaster: walk-forward backtest.

    python -m salarypilot_ml.train.m3_forecast

Every model is evaluated by rolling-origin backtest: fit on everything before
time t, forecast 90 days, roll t forward, repeat. No model ever sees a value
it is later asked to predict.

The headline is MASE against seasonal-naive. Below 1.0 means the model beats
repeating last month; at or above 1.0 it does not, and it gets cut.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from ..data.synth import generate
from ..evaluate.timeseries import (
    coverage, interval_width, mase, rmse, smape, walk_forward_origins,
)
from ..models.forecast import (
    HoltWinters, conformal_intervals, drift, fit_holt_winters,
    mean_forecast, naive, seasonal_naive,
)

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"

SEASON = 30      # the generator uses exact 30-day months; see the caveat below
HORIZON = 90     # what the runway chart needs
MIN_TRAIN = 365
STEP = 45
SEEDS = [7, 11, 23]


def daily_spend(txns) -> np.ndarray:
    """Total debits per day, zero-filled across the whole window."""
    by_day: dict = defaultdict(float)
    for t in txns:
        if t.direction == "debit":
            by_day[t.day] += t.amount

    first, last = min(t.day for t in txns), max(t.day for t in txns)
    n = (last - first).days + 1
    series = np.zeros(n, dtype=np.float64)
    for d, amt in by_day.items():
        series[(d - first).days] = amt
    return series


def evaluate(series: np.ndarray) -> dict:
    origins = walk_forward_origins(len(series), HORIZON, MIN_TRAIN, STEP)
    if not origins:
        return {}

    results: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )
    hw_errors: list[np.ndarray] = []
    hw_points: list[tuple[np.ndarray, np.ndarray]] = []

    for train_end, test_end in origins:
        train = series[:train_end]
        actual = series[train_end:test_end]

        preds = {
            "naive": naive(train, HORIZON),
            "mean": mean_forecast(train, HORIZON),
            "drift": drift(train, HORIZON),
            "seasonal_naive": seasonal_naive(train, HORIZON, SEASON),
        }

        try:
            hw = fit_holt_winters(train, m=SEASON)
            preds["holt_winters"] = hw.forecast(HORIZON)
        except ValueError:
            pass

        # Default parameters, no search. Included to show how much the grid
        # search is actually buying - often less than people assume.
        try:
            preds["hw_default"] = HoltWinters(m=SEASON).fit(train).forecast(HORIZON)
        except ValueError:
            pass

        for name, p in preds.items():
            results[name]["mase"].append(mase(actual, p, train, SEASON))
            results[name]["smape"].append(smape(actual, p))
            results[name]["rmse"].append(rmse(actual, p))
            # The metric that matters to the product. Runway does not care
            # what Tuesday costs - it cares about total burn over the horizon.
            # Daily errors largely cancel in a sum; systematic bias does not,
            # which is precisely the failure that would mis-state a runway.
            act_sum, pred_sum = float(actual.sum()), float(p.sum())
            results[name]["burn_err_pct"].append(
                abs(pred_sum - act_sum) / act_sum * 100 if act_sum > 0 else float("nan")
            )
            results[name]["burn_bias_pct"].append(
                (pred_sum - act_sum) / act_sum * 100 if act_sum > 0 else float("nan")
            )

        if "holt_winters" in preds:
            hw_errors.append(actual - preds["holt_winters"])
            hw_points.append((preds["holt_winters"], actual))

    # ── Conformal intervals, calibrated on earlier windows only ─────────
    # Window i is covered using errors from windows before it. Calibrating on
    # all windows including the one being scored would leak the answer into
    # its own interval and report coverage that cannot be reproduced live.
    cov, width = [], []
    MIN_CAL = 4
    for i in range(MIN_CAL, len(hw_points)):
        cal = np.vstack(hw_errors[:i])
        point, actual = hw_points[i]
        lo, hi = conformal_intervals(cal, point, alpha=0.1)
        cov.append(coverage(actual, lo, hi))
        width.append(interval_width(lo, hi))

    return {
        "origins": len(origins),
        "models": {
            name: {k: float(np.nanmean(v)) for k, v in metrics.items()}
            for name, metrics in results.items()
        },
        "conformal": {
            "coverage": float(np.mean(cov)) if cov else float("nan"),
            "width": float(np.mean(width)) if width else float("nan"),
            "n_windows": len(cov),
        },
    }


def main() -> None:
    t0 = time.time()
    print("M3 - Cash-flow forecaster")
    print("=" * 72)
    print(f"\n  walk-forward origins, {HORIZON}-day horizon, {SEASON}-day season")
    print("  fit on everything before t, forecast forward, roll t along.")
    print("  No model ever sees a value it is later asked to predict.")

    runs = []
    for seed in SEEDS:
        txns, _ = generate(months=48, seed=seed)
        series = daily_spend(txns)
        r = evaluate(series)
        if r:
            runs.append(r)
            print(f"\n  seed {seed:>4}   {len(series)} days   "
                  f"{r['origins']} origins   "
                  f"mean daily spend {series.mean():,.0f}")

    names = sorted({n for r in runs for n in r["models"]})

    def agg(name: str, metric: str) -> float:
        vals = [r["models"][name][metric] for r in runs if name in r["models"]]
        return float(np.nanmean(vals)) if vals else float("nan")

    print(f"\n  DAILY ACCURACY   (hard, noisy, and not what the product needs)")
    print(f"  {'model':<20}{'MASE':>10}{'sMAPE %':>11}{'RMSE':>12}")
    print(f"  {'-' * 53}")
    for name in sorted(names, key=lambda n: agg(n, "mase")):
        star = "  *" if name == "seasonal_naive" else ""
        print(f"  {name:<20}{agg(name, 'mase'):>10.3f}{agg(name, 'smape'):>11.1f}"
              f"{agg(name, 'rmse'):>12,.0f}{star}")
    print("  * the bar")

    print(f"\n  90-DAY BURN TOTAL   (what runway actually asks for)")
    print(f"  {'model':<20}{'abs err %':>12}{'bias %':>10}{'verdict':>14}")
    print(f"  {'-' * 56}")
    ordered = sorted(names, key=lambda n: agg(n, "burn_err_pct"))
    for name in ordered:
        e, b = agg(name, "burn_err_pct"), agg(name, "burn_bias_pct")
        v = "usable" if e < 10 else ("marginal" if e < 20 else "too rough")
        print(f"  {name:<20}{e:>12.1f}{b:>10.1f}{v:>14}")
    print("\n  Daily errors largely cancel in a 90-day sum; systematic bias does")
    print("  not. Bias is the column that would mis-state somebody's runway.")

    hw = agg("holt_winters", "mase")
    sn = agg("seasonal_naive", "mase")
    best = ordered[0]

    cov = float(np.nanmean([r["conformal"]["coverage"] for r in runs]))
    wid = float(np.nanmean([r["conformal"]["width"] for r in runs]))

    print(f"\n  CONFORMAL INTERVALS   nominal 90%")
    print(f"    empirical coverage  {cov:.3f}")
    print(f"    mean band width     {wid:,.0f} per day")
    gap = cov - 0.90
    if abs(gap) <= 0.05:
        print(f"    within {abs(gap) * 100:.1f} points of nominal - well calibrated")
    elif gap > 0:
        print(f"    {gap * 100:.1f} points OVER-covered - intervals are too wide,")
        print("    which is safe but less informative than it should be")
    else:
        print(f"    {abs(gap) * 100:.1f} points UNDER-covered - intervals too narrow,")
        print("    which is the dangerous direction and must not ship")

    burn_hw = agg("holt_winters", "burn_err_pct")
    burn_best = agg(best, "burn_err_pct")
    calibrated = abs(cov - 0.90) <= 0.05

    print("\n" + "=" * 72)
    if best != "holt_winters" and burn_best < burn_hw * 0.85:
        # The result that inverts the decision, and the reason the burn column
        # exists at all. Holt-Winters is clearly the better DAILY model - it
        # tracks the monthly rent spike that a flat line cannot. But runway
        # asks for a 90-day TOTAL, and on that a flat mean is roughly twice as
        # accurate, because the smoothing model's trend term extrapolates and
        # that error accumulates across every one of the ninety days while a
        # mean stays unbiased.
        #
        # Picking the model that wins the metric the product does not use is
        # exactly the mistake this whole harness exists to catch.
        print(f"  USE '{best}' FOR RUNWAY - 90-day burn error {burn_best:.1f}%")
        print(f"  against Holt-Winters at {burn_hw:.1f}%. Holt-Winters is the")
        print(f"  better daily model (MASE {hw:.3f} vs {agg(best, 'mase'):.3f}) and")
        print("  still draws the depletion CURVE, because it has the monthly")
        print("  shape a flat line cannot. But the runway NUMBER comes from the")
        print("  simpler estimator, which is unbiased over a long sum.")
        print(f"\n  Intervals calibrated at {cov:.3f} against nominal 0.90.")
        verdict = f"split-{best}-for-total-hw-for-shape"
    elif hw < sn * 0.98 and not calibrated:
        # Accuracy alone is not sufficient, and an earlier version of this
        # script proved why: it printed "must not ship" about the intervals
        # and then shipped anyway, because the gate only looked at MASE. A
        # point forecast whose uncertainty band is wrong is worse than one
        # with no band, because the band gets believed.
        print(f"  BLOCKED - the point forecast is good (MASE {hw:.3f} vs {sn:.3f})")
        print(f"  but coverage is {cov:.3f} against a nominal 0.90. Ship the")
        print("  forecast only once the intervals are honest.")
        verdict = "blocked-on-calibration"
    elif hw < sn * 0.98:
        print(f"  SHIP Holt-Winters - MASE {hw:.3f} against seasonal-naive {sn:.3f},")
        print(f"  a {(1 - hw / sn) * 100:.1f}% error reduction; 90-day burn total")
        print(f"  within {burn_hw:.1f}%; intervals calibrated at {cov:.3f}.")
        verdict = "ship"
    elif best != "holt_winters":
        print(f"  CUT Holt-Winters - MASE {hw:.3f}, and '{best}' does better at")
        print(f"  {agg(best, 'mase'):.3f}. A model that loses to a one-line baseline")
        print("  is not a model, and keeping it would be decoration.")
        verdict = "cut"
    else:
        print(f"  MARGINAL - Holt-Winters {hw:.3f} vs seasonal-naive {sn:.3f}.")
        print("  Not enough to justify the extra machinery.")
        verdict = "marginal"

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "m3_metrics.json").write_text(json.dumps({
        "model": "m3_forecast",
        "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "seeds": SEEDS,
        "horizon_days": HORIZON,
        "season": SEASON,
        "models": {n: {"mase": agg(n, "mase"), "smape": agg(n, "smape"),
                       "rmse": agg(n, "rmse")} for n in names},
        "best": best,
        "burn_err_pct": {n: agg(n, "burn_err_pct") for n in names},
        "burn_bias_pct": {n: agg(n, "burn_bias_pct") for n in names},
        "conformal": {"nominal": 0.90, "empirical_coverage": cov,
                      "mean_width": wid, "calibrated": bool(calibrated)},
        "verdict": verdict,
    }, indent=2), encoding="utf-8")

    print(f"\n  artifacts -> {ARTIFACTS / 'm3_metrics.json'}")
    print(f"  total {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
