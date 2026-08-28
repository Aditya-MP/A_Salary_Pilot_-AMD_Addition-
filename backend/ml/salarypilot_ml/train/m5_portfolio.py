"""
M5 - Portfolio optimiser: out-of-sample backtest on REAL market data.

    python -m salarypilot_ml.train.m5_portfolio

THE BUG THIS REWRITE FIXES
-----------------------------
The previous version of this file, and the /v1/allocate endpoint that served
its output, both ran on a calibrated SYNTHETIC one-factor simulator seeded at
a hardcoded value. That is a sound way to demonstrate an optimiser's
mechanics, but it was quietly wrong once put behind a live endpoint: every
call, for every user, on every day, produced the exact same covariance
matrix and therefore the exact same weights. Nothing about the computation
could ever change - not the date, not real market conditions, nothing. A
user checking back in six months would see numbers indistinguishable from a
frozen screenshot. See data/market_factors.py for the fix: six real,
verified-reachable instruments (a real Nifty 50 index, a real gold ETF, real
Bitcoin, etc.), refetched and re-evaluated rather than simulated.

THE QUESTION THIS FILE ANSWERS
-----------------------------------
Not whether the optimiser finds the efficient frontier - it provably does,
the problem is convex. The question is whether a frontier built from
ESTIMATED inputs beats naive diversification on data it has never seen.

The literature says usually not. DeMiguel, Garlappi and Uppal (2009) tested
fourteen optimisation models and none reliably beat 1/N, because estimation
error in the inputs swamps the optimisation gain. So 1/N is the bar, and it
is a real one.

Protocol: estimate on a rolling window of REAL returns, hold the resulting
weights for the next real quarter, rebalance, repeat. Weights are never
chosen using returns they are later scored on.

THE ONE HONEST LIMITATION
----------------------------
ESG.NS (the youngest of the six real instruments) only has real history back
to 2023-08-29, which caps the common evaluation window at roughly three
years - about seven walk-forward quarters, not the dozens a longer-lived
universe would give. That is disclosed in every artifact this script writes,
not smoothed into a bigger number. See data/market_factors.py for why.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from ..data.market_factors import ASSETS, TICKERS, aligned_returns
from ..models.portfolio import (
    black_litterman, equal_weight, ledoit_wolf, max_sharpe, min_variance,
    risk_profile_views, sample_covariance,
)

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"

EQUITY_IDX = [0, 1, 4]
DEBT_IDX = [2]

TRAIN = 252       # one real trading year of estimation window
HOLD = 63         # one quarter

# No single asset above 35%. Unconstrained minimum-variance put 91% into one
# low-volatility fund - which is minimum-variance working exactly as specified
# and still not a portfolio anybody should hold. A covariance matrix cannot see
# issuer default, a rate shock, or a fund closing; the cap is what covers the
# risks the model does not model.
MAX_WEIGHT = 0.35


def annualise(daily: np.ndarray) -> tuple[float, float, float]:
    """Return (annual return, annual vol, Sharpe) from a daily series."""
    mu = float(daily.mean()) * 252
    vol = float(daily.std(ddof=1)) * np.sqrt(252)
    return mu, vol, (mu / vol if vol > 1e-12 else 0.0)


def max_drawdown(daily: np.ndarray) -> float:
    curve = np.cumprod(1 + daily)
    peak = np.maximum.accumulate(curve)
    return float(np.min(curve / peak) - 1)


def backtest(dates: list[str], rets: np.ndarray) -> dict:
    """
    ONE walk-forward pass over the real historical path - there is no seed
    loop here, unlike the synthetic version this replaced. Real history only
    happened once; running it "three times" would not test anything the
    first run did not already test.
    """
    n_assets = len(ASSETS)

    strategies: dict[str, list] = {
        "1/N equal weight": [],
        "min-var uncapped": [],
        "min-var (sample cov)": [],
        "min-var (Ledoit-Wolf)": [],
        "max-Sharpe (LW)": [],
        "Black-Litterman (balanced)": [],
    }
    concentration: dict[str, list[float]] = {k: [] for k in strategies}
    turnover: dict[str, list[float]] = {k: [] for k in strategies}
    prev_w: dict[str, np.ndarray] = {}
    shrinkages: list[float] = []
    quarter_starts: list[str] = []

    start = TRAIN
    while start + HOLD <= len(rets):
        window = rets[start - TRAIN: start]
        future = rets[start: start + HOLD]
        quarter_starts.append(dates[start])

        S = sample_covariance(window)
        LW, delta = ledoit_wolf(window)
        shrinkages.append(delta)
        mu_hat = window.mean(axis=0)

        P, Q = risk_profile_views(n_assets, EQUITY_IDX, DEBT_IDX, "balanced")
        bl_mu, bl_cov = black_litterman(LW, equal_weight(n_assets), P, Q)

        weights = {
            "1/N equal weight": equal_weight(n_assets),
            "min-var uncapped": min_variance(LW),
            "min-var (sample cov)": min_variance(S, MAX_WEIGHT),
            "min-var (Ledoit-Wolf)": min_variance(LW, MAX_WEIGHT),
            "max-Sharpe (LW)": max_sharpe(mu_hat, LW, max_weight=MAX_WEIGHT),
            "Black-Litterman (balanced)": max_sharpe(bl_mu, bl_cov, max_weight=MAX_WEIGHT),
        }

        for name, w in weights.items():
            strategies[name].extend((future @ w).tolist())
            concentration[name].append(float(w.max()))
            if name in prev_w:
                turnover[name].append(float(np.abs(w - prev_w[name]).sum()))
            prev_w[name] = w

        start += HOLD

    out = {
        "shrinkage": float(np.mean(shrinkages)) if shrinkages else 0.0,
        "n_quarters": len(quarter_starts),
        "quarter_starts": quarter_starts,
        "strategies": {},
    }
    for name, daily in strategies.items():
        arr = np.array(daily)
        mu, vol, sharpe = annualise(arr)
        out["strategies"][name] = {
            "return": mu, "vol": vol, "sharpe": sharpe,
            "max_drawdown": max_drawdown(arr),
            "turnover": float(np.mean(turnover[name])) if turnover[name] else 0.0,
            "max_position": float(np.mean(concentration[name])),
        }
    return out


def main() -> None:
    t0 = time.time()
    print("M5 - Portfolio optimiser, evaluated on REAL market data")
    print("=" * 78)

    dates, rets = aligned_returns()
    n_quarters_available = (len(rets) - TRAIN) // HOLD
    print(f"\n  real instruments: " + ", ".join(f"{a}={TICKERS[a]}" for a in ASSETS))
    print(f"  {len(dates)} real trading days, {dates[0]} -> {dates[-1]}")
    print(f"  rolling {TRAIN}-day estimation, {HOLD}-day hold "
          f"-> {n_quarters_available} walk-forward quarters")

    if n_quarters_available < 4:
        raise RuntimeError(
            f"only {n_quarters_available} evaluable quarters - not enough real "
            "history yet to trust this evaluation"
        )

    run = backtest(dates, rets)
    names = list(run["strategies"].keys())
    n_q = run["n_quarters"]

    print(f"\n  Ledoit-Wolf shrinkage intensity   {run['shrinkage']:.3f}")
    print(f"  ({run['shrinkage'] * 100:.0f}% weight on the structured target, "
          f"{(1 - run['shrinkage']) * 100:.0f}% on the sample covariance)")

    print(f"\n  {'strategy':<28}{'return':>9}{'vol':>8}{'Sharpe':>9}"
          f"{'maxDD':>9}{'maxpos':>8}{'turn':>8}")
    print(f"  {'-' * 78}")

    def m(name: str, metric: str) -> float:
        return run["strategies"][name][metric]

    ordered = sorted(names, key=lambda n: -m(n, "sharpe"))
    for name in ordered:
        tag = "  *" if name == "1/N equal weight" else (
            "  x" if name == "min-var uncapped" else "")
        print(f"  {name:<28}{m(name, 'return') * 100:>8.2f}%"
              f"{m(name, 'vol') * 100:>7.2f}%"
              f"{m(name, 'sharpe'):>9.3f}"
              f"{m(name, 'max_drawdown') * 100:>8.1f}%"
              f"{m(name, 'max_position') * 100:>7.0f}%"
              f"{m(name, 'turnover'):>8.3f}{tag}")
    print("  * the bar")
    print("  x diagnostic only, NOT a ship candidate - see below")

    base_sharpe = m("1/N equal weight", "sharpe")
    print(f"\n  vs 1/N   ({n_q} real quarters, {dates[TRAIN]} onward)")
    for name in ordered:
        if name == "1/N equal weight":
            continue
        print(f"    {name:<28}{m(name, 'sharpe') - base_sharpe:>+8.3f} Sharpe")

    print(f"\n  WHY THE UNCAPPED ROW IS DISQUALIFIED")
    print(f"    It posts a Sharpe of {m('min-var uncapped', 'sharpe'):.3f} by holding "
          f"{m('min-var uncapped', 'max_position') * 100:.0f}% in")
    print("    a single asset. That is minimum-variance doing exactly what it was")
    print("    asked, and still not a portfolio anyone should hold: a covariance")
    print("    matrix cannot see issuer default, a rate shock or a fund closing.")

    candidates = [n for n in ordered if n != "min-var uncapped"]
    best = candidates[0]
    best_beats_1n = best != "1/N equal weight" and m(best, "sharpe") > base_sharpe

    mv = "min-var (Ledoit-Wolf)"
    vol_cut = (1 - m(mv, "vol") / m("1/N equal weight", "vol")) * 100
    dd_cut = (1 - m(mv, "max_drawdown") / m("1/N equal weight", "max_drawdown")) * 100

    print(f"\n  MINIMUM-VARIANCE, judged on its own objective")
    print(f"    volatility     {vol_cut:+.1f}% vs 1/N")
    print(f"    max drawdown   {dd_cut:+.1f}% vs 1/N")

    lw_d = m("min-var (Ledoit-Wolf)", "sharpe") - m("min-var (sample cov)", "sharpe")
    print(f"\n  DOES SHRINKAGE HELP?   Ledoit-Wolf vs sample covariance")
    print(f"    Sharpe difference: {lw_d:+.3f}")

    print("\n" + "=" * 78)
    if best_beats_1n:
        print(f"  SHIP '{best}' - beats 1/N by {m(best, 'sharpe') - base_sharpe:+.3f} Sharpe "
              f"on this real {n_q}-quarter walk-forward test.")
        verdict = f"ship-{best}"
    elif vol_cut > 10:
        print(f"  SHIP MINIMUM-VARIANCE, and be clear about what for. It does not")
        print(f"  beat 1/N on Sharpe ({m(mv, 'sharpe') - base_sharpe:+.3f}), and the")
        print("  literature says almost nothing does. It cuts volatility by")
        print(f"  {vol_cut:.0f}% and drawdown by {dd_cut:.0f}%, which is the job")
        print("  it was given and the one a nervous first-time investor needs.")
        verdict = "ship-min-variance-for-risk"
    else:
        print(f"  KEEP 1/N - no optimiser beat naive diversification on Sharpe,")
        print("  and none cut risk enough to justify the machinery. This is the")
        print("  expected result and the honest one.")
        verdict = "keep-1-over-n"

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "m5_metrics.json").write_text(json.dumps({
        "model": "m5_portfolio",
        "data_source": "real: " + ", ".join(f"{a}={TICKERS[a]}" for a in ASSETS)
                        + " (Yahoo Finance)",
        "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "assets": ASSETS, "train_days": TRAIN, "hold_days": HOLD,
        "n_quarters": n_q,
        "evaluation_window": {"start": dates[TRAIN], "end": dates[-1]},
        "shrinkage_intensity": run["shrinkage"],
        "strategies": {
            n: {mkey: float(m(n, mkey))
                for mkey in ("return", "vol", "sharpe", "max_drawdown", "turnover")}
            for n in names
        },
        "min_variance_vol_reduction_pct": vol_cut,
        "min_variance_dd_reduction_pct": dd_cut,
        "shrinkage_sharpe_gain": float(lw_d),
        "verdict": verdict,
        "caveat": (
            f"Evaluated on {n_q} real walk-forward quarters "
            f"({dates[TRAIN]} to {dates[-1]}) - real, but a short window (ESG's "
            "real trading history only goes back to 2023). Treat this as an "
            "honest early read, not a settled result."
        ),
    }, indent=2), encoding="utf-8")

    print(f"\n  artifacts -> {ARTIFACTS / 'm5_metrics.json'}")
    print(f"  total {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
