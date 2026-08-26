"""
M6 - Monte Carlo freedom simulator.

    python -m salarypilot_ml.train.m6_freedom

Three questions, in order.

  1. DOES THE RESAMPLER PRESERVE STRUCTURE?
     Block versus IID, measured on volatility clustering. If the resampler
     destroys the dependence in returns, every tail probability it produces is
     wrong in the optimistic direction.

  2. ARE THE PROBABILITIES CALIBRATED?
     A simulator that says 10% must be right about 10% of the time. Tested by
     probability integral transform: predict a distribution from a training
     window, see where the realised outcome actually falls in it, and check
     that those ranks come out uniform. This is the only real test of a
     probabilistic forecast.

  3. WHAT DOES THE PRODUCT SAY?
     The output the user sees, next to the point estimate it replaces.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from ..models.garch import simulate as garch_simulate
from ..models.simulate import (
    Scenario, acf1, iid_bootstrap, simulate_paths,
    stationary_block_bootstrap, volatility_clustering,
)

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"

N_PATHS = 10_000
SEEDS = [7, 11, 23]

# The seed profile from the frontend, in monthly rupees.
PROFILE = Scenario(
    net_worth=8_23_506,
    liquid=5_10_967,
    monthly_income=1_24_000,
    essential_burn=86_900,
    discretionary_burn=24_018,
    monthly_invest=13_082,
    age=29,
    horizon_years=40,
)


def monthly_returns(seed: int, n: int = 360) -> np.ndarray:
    """
    Monthly portfolio returns with realistic volatility clustering.

    Generated from a GARCH process so the series has the dependence structure
    the block bootstrap is supposed to preserve - otherwise the comparison in
    step 1 would be measuring nothing.
    """
    daily = garch_simulate(n * 21, omega=3e-6, alpha=0.09, beta=0.88, nu=6.0, seed=seed)
    monthly = daily[: n * 21].reshape(n, 21).sum(axis=1)
    # ~3.5% annual REAL drift. Everything downstream is in real terms.
    return monthly + 0.00287


def step1_resampler() -> dict:
    print("\n  1 - DOES THE RESAMPLER PRESERVE STRUCTURE?")
    print("  " + "-" * 72)

    rows = []
    for seed in SEEDS:
        r = monthly_returns(seed)
        rng = np.random.default_rng(seed)

        block = stationary_block_bootstrap(r, 400, len(r), 6, rng)
        iid = iid_bootstrap(r, 400, len(r), rng)

        rows.append({
            "original_vol_cluster": volatility_clustering(r),
            "block_vol_cluster": float(np.mean([volatility_clustering(p) for p in block])),
            "iid_vol_cluster": float(np.mean([volatility_clustering(p) for p in iid])),
            "original_mean": float(r.mean()),
            "block_mean": float(block.mean()),
            "iid_mean": float(iid.mean()),
            "original_sd": float(r.std()),
            "block_sd": float(block.std()),
            "iid_sd": float(iid.std()),
        })

    def m(k: str) -> float:
        return float(np.mean([row[k] for row in rows]))

    print(f"    {'property':<26}{'original':>12}{'block':>12}{'IID':>12}")
    print("    " + "-" * 62)
    print(f"    {'mean monthly return':<26}{m('original_mean'):>12.5f}"
          f"{m('block_mean'):>12.5f}{m('iid_mean'):>12.5f}")
    print(f"    {'monthly volatility':<26}{m('original_sd'):>12.5f}"
          f"{m('block_sd'):>12.5f}{m('iid_sd'):>12.5f}")
    print(f"    {'volatility clustering':<26}{m('original_vol_cluster'):>12.3f}"
          f"{m('block_vol_cluster'):>12.3f}{m('iid_vol_cluster'):>12.3f}")

    kept = m("block_vol_cluster") / m("original_vol_cluster") * 100
    lost = m("iid_vol_cluster") / m("original_vol_cluster") * 100
    print(f"\n    Block keeps {kept:.0f}% of the clustering; IID keeps {lost:.0f}%.")
    print("    Both match the mean and volatility exactly - which is the trap.")
    print("    An IID bootstrap looks perfectly rigorous on the summary")
    print("    statistics and has quietly deleted the sequence risk that")
    print("    actually ruins retirements.")

    return {"kept_pct": kept, "iid_kept_pct": lost, "detail": rows}


def step2_calibration() -> dict:
    print("\n  2 - ARE THE PROBABILITIES CALIBRATED?")
    print("  " + "-" * 72)
    print("    Predict a distribution of 5-year cumulative return from a")
    print("    training window; record where the realised outcome falls in it.")
    print("    Those ranks must be uniform, or the stated probabilities lie.")

    HORIZON = 60
    pits_block: list[float] = []
    pits_iid: list[float] = []

    for seed in SEEDS:
        r = monthly_returns(seed, n=600)
        rng = np.random.default_rng(seed + 999)

        # Non-overlapping windows. Stepping by less than the horizon makes
        # consecutive PIT values share most of their data, so they are not
        # independent draws and the coverage estimate is not what it claims.
        for origin in range(240, len(r) - HORIZON, HORIZON):
            train = r[:origin]
            actual = float(np.prod(1 + r[origin : origin + HORIZON]) - 1)

            for label, paths in (
                ("block", stationary_block_bootstrap(train, 2000, HORIZON, 6, rng)),
                ("iid", iid_bootstrap(train, 2000, HORIZON, rng)),
            ):
                dist = np.prod(1 + paths, axis=1) - 1
                pit = float(np.mean(dist <= actual))
                (pits_block if label == "block" else pits_iid).append(pit)

    def coverage(pits: list[float], lo: float, hi: float) -> float:
        a = np.array(pits)
        return float(np.mean((a >= lo) & (a <= hi)))

    print(f"\n    {'interval':<20}{'nominal':>10}{'block':>10}{'IID':>10}")
    print("    " + "-" * 50)
    for lo, hi, nom in ((0.05, 0.95, 0.90), (0.10, 0.90, 0.80), (0.25, 0.75, 0.50)):
        print(f"    {f'{lo:.0%} to {hi:.0%}':<20}{nom:>10.2f}"
              f"{coverage(pits_block, lo, hi):>10.2f}"
              f"{coverage(pits_iid, lo, hi):>10.2f}")

    # A uniform PIT has mean 0.5. Drift away from it is bias.
    mb, mi = float(np.mean(pits_block)), float(np.mean(pits_iid))
    print(f"\n    mean PIT (0.50 = unbiased)   block {mb:.3f}   IID {mi:.3f}")

    c90_b = coverage(pits_block, 0.05, 0.95)
    c90_i = coverage(pits_iid, 0.05, 0.95)
    return {"coverage_90_block": c90_b, "coverage_90_iid": c90_i,
            "mean_pit_block": mb, "mean_pit_iid": mi, "n_windows": len(pits_block)}


def step3_product() -> dict:
    print("\n  3 - WHAT THE PRODUCT SAYS")
    print("  " + "-" * 72)

    r = monthly_returns(7)
    res = simulate_paths(PROFILE, r, n_paths=N_PATHS, seed=7, block=True)
    res_iid = simulate_paths(PROFILE, r, n_paths=N_PATHS, seed=7, block=False)

    reached = np.isfinite(res.fi_age)
    print(f"\n    {N_PATHS:,} paths, 40-year horizon, from age {PROFILE.age}")

    print(f"\n    AGE WORK BECOMES OPTIONAL")
    for q, label in ((10, "best 10%"), (25, "P25"), (50, "median"),
                     (75, "P75"), (90, "worst 10%")):
        print(f"      {label:<12}{res.pct_or_never(res.fi_age, q):>8}")
    print(f"      reaches FI within 40 years: {reached.mean() * 100:.1f}% of paths")
    print("      (percentiles are over ALL paths - 'never' is a real outcome")
    print("       and hiding it behind a survivor-only median is the bias this")
    print("       model exists to remove)")

    print(f"\n    THE CURRENT APP SAYS: 'freedom at 54' - one number, computed by")
    print("    compounding an average return with no job loss, no shock and no")
    print(f"    bad sequence in it. This simulation puts the median at "
          f"{res.pct_or_never(res.fi_age, 50)}")
    print(f"    and the best decile at {res.pct_or_never(res.fi_age, 10)}.")

    # ── The assumption doing all the work ──
    # Before anyone panics at the number above: it is dominated by one input.
    # The frontend assumes 7.5% real; this run used 3.5%. Showing the
    # sensitivity is more honest than picking a side, because the truth is
    # that nobody knows which is right and the answer swings enormously.
    print(f"\n    SENSITIVITY TO THE RETURN ASSUMPTION")
    print("    This is the input that dominates everything above.")
    print(f"      {'real return':>13}{'reaches FI':>13}{'median age':>13}"
          f"{'best decile':>14}")
    print("      " + "-" * 53)
    base_monthly = monthly_returns(7)
    centred = base_monthly - base_monthly.mean()
    sens = {}
    for annual in (0.03, 0.045, 0.06, 0.075, 0.09):
        shifted = centred + (1 + annual) ** (1 / 12) - 1
        rr = simulate_paths(PROFILE, shifted, n_paths=4000, seed=7, block=True)
        pct_fi = float(np.isfinite(rr.fi_age).mean() * 100)
        print(f"      {annual:>12.1%}{pct_fi:>12.1f}%"
              f"{rr.pct_or_never(rr.fi_age, 50):>13}"
              f"{rr.pct_or_never(rr.fi_age, 10):>14}")
        sens[f"{annual:.3f}"] = {"pct_reaching_fi": pct_fi,
                                 "median_age": rr.pct_or_never(rr.fi_age, 50)}
    print("\n      The frontend's 7.5% and this run's 3.5% are both defensible")
    print("      assumptions that produce completely different lives. That gap")
    print("      is the single most important thing to show the user, and a")
    print("      point estimate hides it entirely.")

    print(f"\n    PROBABILITY OF FREEDOM BY AGE")
    for age in (45, 50, 55, 60, 65):
        print(f"      by {age}: {res.prob_fi_by(age) * 100:>5.1f}%")

    print(f"\n    SURVIVING SHOCKS")
    print(f"      never runs out of money:  {res.survived_job_loss.mean() * 100:.1f}%")
    print(f"      ruin at some point:       {res.ruin.mean() * 100:.1f}%")

    print(f"\n    WHAT THE IID BOOTSTRAP WOULD HAVE CLAIMED")
    print(f"      median freedom age    block {res.pct_or_never(res.fi_age, 50)}"
          f"   IID {res_iid.pct_or_never(res_iid.fi_age, 50)}")
    print(f"      best-decile age       block {res.pct_or_never(res.fi_age, 10)}"
          f"   IID {res_iid.pct_or_never(res_iid.fi_age, 10)}")
    print(f"      probability of ruin   block {res.ruin.mean() * 100:.1f}%"
          f"   IID {res_iid.ruin.mean() * 100:.1f}%")

    return {
        "fi_age_p10": res.pct_or_never(res.fi_age, 10),
        "fi_age_p50": res.pct_or_never(res.fi_age, 50),
        "fi_age_p90": res.pct_or_never(res.fi_age, 90),
        "pct_reaching_fi": float(reached.mean() * 100),
        "never_reached_pct": float((1 - reached.mean()) * 100),
        "prob_by_55": res.prob_fi_by(55),
        "ruin_pct": float(res.ruin.mean() * 100),
        "iid_fi_age_p50": res_iid.pct_or_never(res_iid.fi_age, 50),
        "iid_fi_age_p10": res_iid.pct_or_never(res_iid.fi_age, 10),
        "iid_ruin_pct": float(res_iid.ruin.mean() * 100),
        "return_sensitivity": sens,
    }


def main() -> None:
    t0 = time.time()
    print("M6 - Monte Carlo freedom simulator")
    print("=" * 78)

    s1 = step1_resampler()
    s2 = step2_calibration()
    s3 = step3_product()

    calibrated = abs(s2["coverage_90_block"] - 0.90) <= 0.07
    preserves = s1["kept_pct"] > 50

    print("\n" + "=" * 78)
    if not preserves:
        print(f"  BLOCKED - the block bootstrap keeps only {s1['kept_pct']:.0f}% of the")
        print("  volatility clustering. Raise the mean block length before trusting")
        print("  any tail probability from this.")
        verdict = "blocked-on-resampler"
    elif not calibrated:
        print(f"  BLOCKED - 90% intervals cover {s2['coverage_90_block']:.2f}. A simulator")
        print("  whose stated probabilities are wrong is worse than a point")
        print("  estimate, because the probability gets believed.")
        verdict = "blocked-on-calibration"
    else:
        print(f"  SHIP - block bootstrap keeps {s1['kept_pct']:.0f}% of the volatility")
        print(f"  clustering against {s1['iid_kept_pct']:.0f}% for IID, and 90% intervals")
        print(f"  cover {s2['coverage_90_block']:.2f} across {s2['n_windows']} windows.")
        print()
        print("  This replaces the single confident number on the dashboard with a")
        print("  range, and the range is the honest answer. It is also the harder")
        print("  one to show, because a distribution admits the plan can fail.")
        verdict = "ship"

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "m6_metrics.json").write_text(json.dumps({
        "model": "m6_freedom_simulation",
        "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "n_paths": N_PATHS,
        "resampler": {"block_keeps_clustering_pct": s1["kept_pct"],
                      "iid_keeps_clustering_pct": s1["iid_kept_pct"]},
        "calibration": s2,
        "product": s3,
        "verdict": verdict,
    }, indent=2), encoding="utf-8")

    print(f"\n  artifacts -> {ARTIFACTS / 'm6_metrics.json'}")
    print(f"  total {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
