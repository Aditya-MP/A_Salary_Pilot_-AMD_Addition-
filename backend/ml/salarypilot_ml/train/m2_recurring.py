"""
M2 - Recurring payment detection: evaluation.

    python -m salarypilot_ml.train.m2_recurring

There is nothing to train. The question is whether the detector is accurate
enough to act on, and the bar is precision rather than recall: this feature
tells people to cancel things, so a false positive that says "cancel your
rent" costs far more than a missed subscription.

GROUND TRUTH
------------
The generator gives fixed-schedule commitments - subscriptions, EMIs and
housing - a stable day of month. Everything else lands on a random day. So a
merchant is genuinely recurring if and only if its category is one of those
three, and that is knowable independently of anything the detector does.

`utilities` is deliberately excluded from the positive set and reported
separately. An electricity bill arrives monthly but on a drifting date, so it
is the honest boundary case: arguably recurring to a human, correctly not
date-periodic to the algorithm.

BASELINE
--------
"Any merchant seen at least six times is recurring." Frequency alone is the
obvious heuristic and it is what the detector has to beat - otherwise the
autocorrelation is decoration.
"""

from __future__ import annotations

import json
import time
from collections import Counter
from pathlib import Path

import numpy as np

from ..data.synth import MERCHANTS, generate
from ..models.recurring import detect, resolve_merchants

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"

# Categories the generator gives a stable day of month.
SCHEDULED = {"subscriptions", "debt", "housing"}
BOUNDARY = {"utilities"}

CATEGORY_OF = {m.name: m.category for m in MERCHANTS}
SEEDS = [7, 11, 23, 42, 101]


def truth_for_group(members) -> tuple[bool, str, str]:
    """Majority merchant in a resolved group, and whether it is scheduled."""
    names = Counter(t.merchant for t in members)
    name = names.most_common(1)[0][0]
    cat = CATEGORY_OF.get(name, "unknown")
    return cat in SCHEDULED, name, cat


def prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return p, r, f


def evaluate_seed(seed: int) -> dict:
    txns, _ = generate(months=36, seed=seed)

    # Ground truth per resolved group, so the detector and the truth are
    # compared on exactly the same grouping. Scoring against per-merchant
    # truth while the detector works on clusters would measure the resolver
    # and the detector at once and tell us nothing about either.
    groups = resolve_merchants([t.narration for t in txns])
    members: dict[int, list] = {}
    for gid, t in zip(groups, txns):
        members.setdefault(gid, []).append(t)

    truth: dict[int, tuple[bool, str, str]] = {
        gid: truth_for_group(ms) for gid, ms in members.items()
    }

    series = detect(txns)
    predicted = {s.group_id for s in series if s.is_recurring}

    # Baseline: frequency alone.
    base_pred = {gid for gid, ms in members.items() if len(ms) >= 6}

    def score(pred: set[int], exclude_boundary: bool = True) -> dict:
        tp = fp = fn = 0
        fps: list[str] = []
        fns: list[str] = []
        for gid, (is_true, name, cat) in truth.items():
            if exclude_boundary and cat in BOUNDARY:
                continue
            hit = gid in pred
            if is_true and hit:
                tp += 1
            elif is_true and not hit:
                fn += 1
                fns.append(f"{name} ({cat})")
            elif not is_true and hit:
                fp += 1
                fps.append(f"{name} ({cat})")
        p, r, f = prf(tp, fp, fn)
        return {"tp": tp, "fp": fp, "fn": fn, "precision": p, "recall": r,
                "f1": f, "false_positives": fps, "false_negatives": fns}

    boundary_hits = sum(
        1 for gid, (_, _, cat) in truth.items() if cat in BOUNDARY and gid in predicted
    )
    boundary_total = sum(1 for _, (_, _, cat) in truth.items() if cat in BOUNDARY)

    # Period accuracy on the series we correctly flagged as monthly.
    period_err = [
        abs(s.period_days - 30.44) / 30.44
        for s in series
        if s.is_recurring and s.cadence == "monthly" and truth.get(s.group_id, (False,))[0]
    ]

    return {
        "seed": seed,
        "n_groups": len(members),
        "n_true": sum(1 for _, (t, _, c) in truth.items() if t),
        "detector": score(predicted),
        "baseline": score(base_pred),
        "boundary": {"hit": boundary_hits, "total": boundary_total},
        "period_err": period_err,
        "series": series,
        "truth": truth,
    }


def main() -> None:
    t0 = time.time()
    print("M2 - Recurring payment detection")
    print("=" * 74)
    print("\n  Unsupervised: nothing is trained. This works on a new user's")
    print("  first import, which is exactly where M1 is at its weakest.")

    runs = [evaluate_seed(s) for s in SEEDS]

    def agg(arm: str, metric: str) -> np.ndarray:
        return np.array([r[arm][metric] for r in runs])

    print(f"\n  {len(runs)} seeds   ~{runs[0]['n_groups']} resolved merchant groups per seed"
          f"   ~{runs[0]['n_true']} genuinely scheduled")

    print(f"\n  {'':<26}{'precision':>13}{'recall':>13}{'F1':>13}")
    print(f"  {'-' * 65}")
    for label, arm in (("baseline  seen >= 6x", "baseline"), ("M2  autocorrelation", "detector")):
        p, r, f = agg(arm, "precision"), agg(arm, "recall"), agg(arm, "f1")
        print(f"  {label:<26}{p.mean():>8.3f} +-{p.std():<4.2f}"
              f"{r.mean():>8.3f} +-{r.std():<4.2f}{f.mean():>8.3f} +-{f.std():<4.2f}")

    d_p = agg("detector", "precision") - agg("baseline", "precision")
    d_f = agg("detector", "f1") - agg("baseline", "f1")
    print(f"\n  paired delta   precision {d_p.mean():+.3f}"
          f"   F1 {d_f.mean():+.3f}"
          f"   (M2 wins {int((d_f > 0).sum())}/{len(runs)} seeds on F1)")

    errs = [e for r in runs for e in r["period_err"]]
    if errs:
        print(f"\n  monthly period estimate   median error "
              f"{np.median(errs) * 100:.1f}%   "
              f"({np.median(errs) * 30.44:.1f} days off a 30.4-day cycle)")

    bh = sum(r["boundary"]["hit"] for r in runs)
    bt = sum(r["boundary"]["total"] for r in runs)
    print(f"\n  boundary case (utilities, monthly but drifting date)")
    print(f"    flagged {bh}/{bt}. Excluded from scoring above - a human would")
    print("    call an electricity bill recurring, the algorithm correctly")
    print("    will not, and pretending either is wrong would be dishonest.")

    # ── what it actually found ──────────────────────────────────────────
    best = runs[0]
    found = [s for s in best["series"] if s.is_recurring][:14]
    print(f"\n  DETECTED SERIES (seed {best['seed']})")
    print(f"    {'merchant':<26}{'n':>4}{'cadence':>13}{'period':>9}"
          f"{'amount':>11}{'conf':>7}")
    print(f"    {'-' * 70}")
    for s in found:
        truth_flag = "" if best["truth"].get(s.group_id, (False,))[0] else "  <- FP"
        print(f"    {s.label[:25]:<26}{s.n:>4}{s.cadence:>13}"
              f"{s.period_days:>8.0f}d{s.amount:>11,.0f}{s.confidence:>7.2f}{truth_flag}")

    fps = sorted({f for r in runs for f in r["detector"]["false_positives"]})
    fns = sorted({f for r in runs for f in r["detector"]["false_negatives"]})
    if fps:
        print(f"\n  FALSE POSITIVES across all seeds ({len(fps)})")
        for f in fps[:8]:
            print(f"    {f}")
    if fns:
        print(f"\n  MISSED across all seeds ({len(fns)})")
        for f in fns[:8]:
            print(f"    {f}")

    p_mean = agg("detector", "precision").mean()
    r_mean = agg("detector", "recall").mean()

    print("\n" + "=" * 74)
    if p_mean >= 0.85 and d_f.mean() > 0:
        print(f"  SHIP - precision {p_mean:.3f} at recall {r_mean:.3f}, beating the")
        print(f"  frequency baseline by {d_f.mean():+.3f} F1. Precision is what")
        print("  matters here: this feature tells people to cancel things.")
        verdict = "ship"
    elif d_f.mean() > 0:
        print(f"  PROMISING - beats the baseline ({d_f.mean():+.3f} F1) but precision")
        print(f"  is {p_mean:.3f}. Raise min_confidence before this is allowed to")
        print("  recommend a cancellation.")
        verdict = "tune"
    else:
        print(f"  CUT - does not beat counting how often a merchant appears.")
        verdict = "cut"

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "m2_metrics.json").write_text(json.dumps({
        "model": "m2_recurring",
        "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "seeds": SEEDS,
        "detector": {
            "precision": float(agg("detector", "precision").mean()),
            "recall": float(agg("detector", "recall").mean()),
            "f1": float(agg("detector", "f1").mean()),
        },
        "baseline_frequency": {
            "precision": float(agg("baseline", "precision").mean()),
            "recall": float(agg("baseline", "recall").mean()),
            "f1": float(agg("baseline", "f1").mean()),
        },
        "paired_delta_f1": float(d_f.mean()),
        "monthly_period_median_error_pct": float(np.median(errs) * 100) if errs else None,
        "boundary_utilities_flagged": f"{bh}/{bt}",
        "false_positives": fps,
        "false_negatives": fns,
        "verdict": verdict,
    }, indent=2), encoding="utf-8")

    print(f"\n  artifacts -> {ARTIFACTS / 'm2_metrics.json'}")
    print(f"  total {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
