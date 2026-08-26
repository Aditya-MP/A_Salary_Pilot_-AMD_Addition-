"""
M1-v2 - do behavioural features fix the cold-start problem?

    python -m salarypilot_ml.train.m1v2_categoriser

A controlled comparison, not a model announcement. Three arms are trained on
the SAME split with the SAME hyper-parameters and the SAME seed; only the
feature matrix changes, so any difference is attributable to the features.

    v1   character n-grams only          (what shipped)
    b    behavioural features only       (diagnostic: is the new signal real?)
    v2   both                            (the candidate)

Two methodology notes, both of which changed the answer:

1. Macro-F1 now averages only over classes PRESENT in the evaluation set. The
   unseen-merchant holdout contains 5 of 12 categories; scoring the other 7 as
   F1 = 0 capped the achievable number at 0.42 and buried a real effect.

2. One holdout of ~160 transactions from 9 vendors is not enough to decide
   anything. Everything below runs across seven data seeds and reports the
   paired delta and its spread. A single lucky split is not evidence.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from ..data.synth import CATEGORIES, generate, split_holdout
from ..evaluate.metrics import majority_baseline, print_report, report
from ..models.features import FEATURE_NAMES, BehaviouralFeatures, combine
from ..models.softmax import SoftmaxRegression
from ..models.vectorize import CharNGramTfidf

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"

# Identical across every arm. Varying these between arms would make the
# comparison meaningless.
HP = dict(lr=0.6, epochs=30, batch_size=256, l2=1e-5, class_weight="balanced", seed=0)

SEEDS = [7, 11, 23, 42, 101, 202, 303]


def labels_of(txns) -> np.ndarray:
    idx = {c: i for i, c in enumerate(CATEGORIES)}
    return np.asarray([idx[t.category] for t in txns])


def train_arm(Xtr, ytr, Xte, yte, Xun, yun) -> dict:
    clf = SoftmaxRegression(n_classes=len(CATEGORIES), verbose=False, **HP)
    clf.fit(Xtr, ytr)
    clf.fit_temperature(Xte, yte)
    return {
        "clf": clf,
        "seen": report(yte, clf.predict(Xte), CATEGORIES, probs=clf.predict_proba(Xte)),
        "unseen": report(yun, clf.predict(Xun), CATEGORIES, probs=clf.predict_proba(Xun)),
    }


def run_seed(seed: int) -> dict:
    txns, holdout = generate(months=36, seed=seed)
    train_txns, test_txns, unseen_txns = split_holdout(txns, holdout, test_fraction=0.25)
    if not unseen_txns:
        return {}

    ytr, yte, yun = labels_of(train_txns), labels_of(test_txns), labels_of(unseen_txns)

    vec = CharNGramTfidf(ngram_range=(3, 5), min_df=3, max_features=60_000)
    Ttr = vec.fit_transform([t.narration for t in train_txns])
    Tte = vec.transform([t.narration for t in test_txns])
    Tun = vec.transform([t.narration for t in unseen_txns])

    bf = BehaviouralFeatures()
    Btr = bf.fit_transform(train_txns)
    Bte = bf.transform(test_txns)
    Bun = bf.transform(unseen_txns)

    return {
        "seed": seed,
        "base": majority_baseline(ytr, yte, len(CATEGORIES)),
        "v1": train_arm(Ttr, ytr, Tte, yte, Tun, yun),
        "v0": train_arm(Btr, ytr, Bte, yte, Bun, yun),
        "v2": train_arm(combine(Ttr, Btr), ytr, combine(Tte, Bte), yte,
                        combine(Tun, Bun), yun),
        "n_unseen": len(unseen_txns),
        "n_vendors": len({t.merchant for t in unseen_txns}),
        "n_text": vec.n_features,
        "n_behav": bf.n_features,
    }


def main() -> None:
    t0 = time.time()
    print("M1-v2 - behavioural features vs text only")
    print("=" * 74)

    runs = []
    for s in SEEDS:
        print(f"  seed {s:>4} ...", end="", flush=True)
        r = run_seed(s)
        if r:
            runs.append(r)
            print(f" unseen {r['n_unseen']:>4} txns / {r['n_vendors']} vendors"
                  f"   v1 {r['v1']['unseen']['macro_f1']:.3f}"
                  f" -> v2 {r['v2']['unseen']['macro_f1']:.3f}")
        else:
            print(" skipped (no unseen split)")

    total_unseen = sum(r["n_unseen"] for r in runs)
    print(f"\n  {len(runs)} seeds, {total_unseen:,} unseen transactions in total")
    print(f"  text features ~{runs[0]['n_text']:,}   behavioural {runs[0]['n_behav']}")

    def col(arm, split, metric):
        return np.array([r[arm][split][metric] for r in runs])

    def row(name, sf, uf, ua):
        print(f"  {name:<24}{sf.mean():>10.4f} +-{sf.std():<6.3f}"
              f"{uf.mean():>10.4f} +-{uf.std():<6.3f}"
              f"{ua.mean():>10.4f} +-{ua.std():<6.3f}")

    print(f"\n  {'arm':<24}{'seen macro-F1':>18}{'unseen macro-F1':>18}"
          f"{'unseen acc':>18}")
    print(f"  {'-' * 76}")

    b_f1 = np.array([r["base"]["macro_f1"] for r in runs])
    b_ac = np.array([r["base"]["accuracy"] for r in runs])
    row("baseline", b_f1, b_f1, b_ac)
    for label, arm in (("v1  text only", "v1"),
                       ("b   behaviour only", "v0"),
                       ("v2  text + behaviour", "v2")):
        row(label, col(arm, "seen", "macro_f1"),
            col(arm, "unseen", "macro_f1"), col(arm, "unseen", "accuracy"))

    # Paired: same split, same seed, so the difference is not split luck.
    d_uf = col("v2", "unseen", "macro_f1") - col("v1", "unseen", "macro_f1")
    d_ua = col("v2", "unseen", "accuracy") - col("v1", "unseen", "accuracy")
    d_sf = col("v2", "seen", "macro_f1") - col("v1", "seen", "macro_f1")
    n = len(runs)

    print(f"\n  PAIRED DELTAS   v2 - v1, identical split each time")
    print(f"    unseen macro-F1   {d_uf.mean():+.4f} +-{d_uf.std():.4f}"
          f"   v2 wins {int((d_uf > 0).sum())}/{n}")
    print(f"    unseen accuracy   {d_ua.mean():+.4f} +-{d_ua.std():.4f}"
          f"   v2 wins {int((d_ua > 0).sum())}/{n}")
    print(f"    seen   macro-F1   {d_sf.mean():+.4f} +-{d_sf.std():.4f}"
          f"   v2 wins {int((d_sf > 0).sum())}/{n}")

    # Calibration on unseen data matters more than on seen: a model that is
    # confidently wrong about a new user's first month is worse than one that
    # admits uncertainty.
    e1 = np.array([r["v1"]["unseen"]["ece"] for r in runs])
    e2 = np.array([r["v2"]["unseen"]["ece"] for r in runs])
    print(f"\n    unseen ECE        v1 {e1.mean():.4f}  ->  v2 {e2.mean():.4f}"
          f"   ({'better' if e2.mean() < e1.mean() else 'worse'})")

    best = max(runs, key=lambda r: r["v2"]["unseen"]["macro_f1"])
    print_report(best["v2"]["unseen"], CATEGORIES,
                 title=f"v2 unseen merchants, best seed ({best['seed']})")

    wins = int((d_uf > 0).sum())
    ship = d_uf.mean() > 0.03 and wins >= n * 0.7
    verdict = "ship" if ship else "keep-v1"

    print("\n" + "=" * 74)
    if ship:
        print(f"  SHIP v2 - unseen macro-F1 {d_uf.mean():+.4f} on average, winning")
        print(f"  {wins} of {n} seeds, and unseen accuracy {d_ua.mean():+.4f}.")
        print(f"  Seen merchants give up {abs(d_sf.mean()):.4f}, which is the right")
        print("  trade: cold start is when a user decides whether to trust this.")
    else:
        print(f"  KEEP v1 - unseen macro-F1 moved {d_uf.mean():+.4f} ({wins}/{n} seeds)")
        print(f"  while seen dropped {abs(d_sf.mean()):.4f}. On this evidence the")
        print("  behavioural block is not carrying its weight. See the note below.")

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "m1v2_comparison.json").write_text(json.dumps({
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "hyperparameters": HP,
        "seeds": SEEDS,
        "n_unseen_total": int(total_unseen),
        "arms": {
            arm: {
                "seen_macro_f1": float(col(arm, "seen", "macro_f1").mean()),
                "unseen_macro_f1": float(col(arm, "unseen", "macro_f1").mean()),
                "unseen_accuracy": float(col(arm, "unseen", "accuracy").mean()),
            } for arm in ("v1", "v0", "v2")
        },
        "paired_delta_unseen_macro_f1": {
            "mean": float(d_uf.mean()), "std": float(d_uf.std()),
            "wins": wins, "of": n,
        },
        "paired_delta_unseen_accuracy": {
            "mean": float(d_ua.mean()), "std": float(d_ua.std()),
        },
        "paired_delta_seen_macro_f1": {"mean": float(d_sf.mean())},
        "unseen_ece": {"v1": float(e1.mean()), "v2": float(e2.mean())},
        "verdict": verdict,
        "behavioural_features": FEATURE_NAMES,
    }, indent=2), encoding="utf-8")

    print(f"\n  artifacts -> {ARTIFACTS / 'm1v2_comparison.json'}")
    print(f"  total {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
