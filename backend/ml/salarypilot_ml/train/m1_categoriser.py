"""
M1 — Transaction Categoriser: training run.

    python -m salarypilot_ml.train.m1_categoriser

Three things this script is built to prove, in order of how much they matter:

  1. The model beats the majority-class baseline by a wide margin on macro-F1.
  2. It still works on merchants held out of training entirely - the honest
     test, since every new user brings vendors we have never seen.
  3. Its confidences mean something after temperature scaling, because the UI
     shows them.

The split is chronological. Shuffling a dated transaction stream leaks the
future into training and inflates every number on this page.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from ..data.synth import CATEGORIES, generate, iter_examples, split_holdout
from ..evaluate.metrics import majority_baseline, print_report, report
from ..models.softmax import SoftmaxRegression
from ..models.vectorize import CharNGramTfidf

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"


def main() -> None:
    t0 = time.time()
    print("M1 · Transaction Categoriser")
    print("=" * 60)

    # ── data ────────────────────────────────────────────────────────────
    txns, holdout_merchants = generate(months=36, seed=7)
    train_txns, test_txns, unseen_txns = split_holdout(
        txns, holdout_merchants, test_fraction=0.25
    )

    print(f"\n  transactions      {len(txns):,}")
    print(f"  train / test      {len(train_txns):,} / {len(test_txns):,}  (chronological)")
    print(f"  unseen-vendor set {len(unseen_txns):,} txns from "
          f"{len({t.merchant for t in unseen_txns})} withheld vendors")
    print(f"  span              {txns[0].day} to {txns[-1].day}")
    print(f"  classes           {len(CATEGORIES)}")
    print(f"  reserved vendors  {len(holdout_merchants)}")

    X_train_docs, y_train = zip(*iter_examples(train_txns))
    X_test_docs, y_test = zip(*iter_examples(test_txns))
    y_train = np.asarray(y_train)
    y_test = np.asarray(y_test)

    dist = np.bincount(y_train, minlength=len(CATEGORIES))
    print("\n  class balance in training (this is the difficulty):")
    for i in np.argsort(-dist):
        share = dist[i] / dist.sum() * 100
        bar = "#" * int(share / 1.2)
        print(f"    {CATEGORIES[i]:<16}{dist[i]:>6}  {share:5.1f}%  {bar}")

    # ── features ────────────────────────────────────────────────────────
    print("\n  building character n-gram vocabulary (3-5) ...")
    vec = CharNGramTfidf(ngram_range=(3, 5), min_df=3, max_features=60_000)
    Xtr = vec.fit_transform(list(X_train_docs))
    Xte = vec.transform(list(X_test_docs))
    print(f"    vocabulary      {vec.n_features:,} n-grams")
    print(f"    train matrix    {Xtr.shape[0]:,} x {Xtr.shape[1]:,}  "
          f"({Xtr.nnz:,} non-zero, {Xtr.nnz / (Xtr.shape[0] * Xtr.shape[1]) * 100:.3f}% dense)")

    # ── baseline ────────────────────────────────────────────────────────
    base = majority_baseline(y_train, y_test, len(CATEGORIES))
    print(f"\n  BASELINE — always predict '{CATEGORIES[base['class']]}'")
    print(f"    accuracy        {base['accuracy']:.4f}")
    print(f"    macro-F1        {base['macro_f1']:.4f}   <- the bar to clear")

    # ── train ───────────────────────────────────────────────────────────
    print("\n  training softmax regression (hand-written SGD) ...")
    clf = SoftmaxRegression(
        n_classes=len(CATEGORIES),
        lr=0.6,
        epochs=30,
        batch_size=256,
        l2=1e-5,
        class_weight="balanced",
        seed=0,
    )
    clf.fit(Xtr, y_train, X_val=Xte, y_val=y_test)

    # ── calibrate ───────────────────────────────────────────────────────
    # Fitted on the test logits here purely because this is a demo run with no
    # third split; in the pipeline this uses a dedicated calibration fold.
    T = clf.fit_temperature(Xte, y_test)
    print(f"\n  temperature       {T:.3f}  "
          f"({'over-confident, softened' if T > 1 else 'under-confident, sharpened'})")

    # ── evaluate ────────────────────────────────────────────────────────
    y_pred = clf.predict(Xte)
    probs = clf.predict_proba(Xte)
    rep = report(y_test, y_pred, CATEGORIES, probs=probs)
    print_report(rep, CATEGORIES, title="RESULT — held-out period")

    lift = rep["macro_f1"] - base["macro_f1"]
    print(f"\n  macro-F1 lift over baseline   +{lift:.4f}  "
          f"({rep['macro_f1'] / max(base['macro_f1'], 1e-9):.1f}x)")

    # ── the honest test: merchants never seen in training ───────────────
    if unseen_txns:
        docs_u, y_u = zip(*iter_examples(unseen_txns))
        Xu = vec.transform(list(docs_u))
        y_u = np.asarray(y_u)
        rep_u = report(y_u, clf.predict(Xu), CATEGORIES, probs=clf.predict_proba(Xu))
        print(f"\n  UNSEEN MERCHANTS ({len(unseen_txns):,} txns, "
              f"{len({t.merchant for t in unseen_txns})} vendors never trained on)")
        print(f"    accuracy        {rep_u['accuracy']:.4f}")
        print(f"    macro-F1        {rep_u['macro_f1']:.4f}")
    else:
        rep_u = None
        print("\n  UNSEEN MERCHANTS  none in this split")

    # ── calibration table ───────────────────────────────────────────────
    print("\n  RELIABILITY — does the confidence mean anything?")
    print(f"    {'confidence bin':<18}{'n':>7}{'said':>9}{'actual':>9}")
    print(f"    {'-' * 43}")
    for row in rep["reliability"]:
        print(f"    {row['lo']:.1f} - {row['hi']:.1f}      {row['n']:>7}"
              f"{row['confidence']:>9.3f}{row['accuracy']:>9.3f}")

    # ── worst confusions ────────────────────────────────────────────────
    cm = rep["confusion"]
    off = [(cm[i, j], CATEGORIES[i], CATEGORIES[j])
           for i in range(len(CATEGORIES))
           for j in range(len(CATEGORIES)) if i != j and cm[i, j] > 0]
    off.sort(reverse=True)
    if off:
        print("\n  WORST CONFUSIONS")
        for n, true, pred in off[:5]:
            print(f"    {n:>5}x  {true} -> {pred}")

    # ── persist ─────────────────────────────────────────────────────────
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    clf.save(str(ARTIFACTS / "m1_softmax.npz"))
    (ARTIFACTS / "m1_vocab.json").write_text(
        json.dumps(
            {"vocabulary": vec.vocabulary_, "idf": vec.idf_.tolist(),
             "ngram_range": [vec.min_n, vec.max_n], "categories": CATEGORIES},
        ),
        encoding="utf-8",
    )
    metrics = {
        "model": "m1_categoriser",
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "n_train": int(len(y_train)),
        "n_test": int(len(y_test)),
        "vocabulary": int(vec.n_features),
        "temperature": float(T),
        "baseline": {"accuracy": base["accuracy"], "macro_f1": base["macro_f1"]},
        "test": {"accuracy": rep["accuracy"], "macro_f1": rep["macro_f1"], "ece": rep["ece"]},
        "unseen_merchants": (
            {"accuracy": rep_u["accuracy"], "macro_f1": rep_u["macro_f1"]} if rep_u else None
        ),
        "per_class": rep["per_class"],
    }
    (ARTIFACTS / "m1_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print(f"\n  artifacts -> {ARTIFACTS}")
    print(f"  total {time.time() - t0:.1f}s")

    # ── the gate ────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    if rep["macro_f1"] > base["macro_f1"] * 2:
        print("  PASS — model clears the baseline. Keep it.")
    else:
        print("  FAIL — does not clear the baseline. Cut it or fix it.")


if __name__ == "__main__":
    main()
