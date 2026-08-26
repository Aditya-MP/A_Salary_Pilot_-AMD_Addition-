"""
Classification metrics, written directly.

Macro-F1 is the headline rather than accuracy, and the distinction is the
whole point on this dataset. `food` is roughly a third of all transactions, so
a model that predicts nothing but `food` already scores ~33% accuracy while
being completely useless. Macro-F1 averages the per-class F1 without weighting
by frequency, so that same degenerate model scores about 0.05 - which is an
honest description of it.

Expected Calibration Error is included because the product displays a
confidence next to every auto-categorised transaction. A confidence that does
not match reality is worse than showing none at all.
"""

from __future__ import annotations

import numpy as np


def confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, k: int) -> np.ndarray:
    cm = np.zeros((k, k), dtype=np.int64)
    np.add.at(cm, (y_true, y_pred), 1)
    return cm


def per_class(cm: np.ndarray) -> dict[str, np.ndarray]:
    tp = np.diag(cm).astype(np.float64)
    fp = cm.sum(axis=0) - tp
    fn = cm.sum(axis=1) - tp

    precision = np.divide(tp, tp + fp, out=np.zeros_like(tp), where=(tp + fp) > 0)
    recall = np.divide(tp, tp + fn, out=np.zeros_like(tp), where=(tp + fn) > 0)
    denom = precision + recall
    f1 = np.divide(2 * precision * recall, denom, out=np.zeros_like(tp), where=denom > 0)

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "support": cm.sum(axis=1),
    }


def macro_f1(cm: np.ndarray, present_only: bool = True) -> float:
    """
    Unweighted mean F1. A class with 8 examples counts as much as one with 8000.

    `present_only` excludes classes with zero support in the evaluation set,
    and it defaults to True because the alternative is actively misleading.

    This was a real bug here. The unseen-merchant holdout contains only 5 of
    the 12 categories; the other 7 cannot appear at all. Averaging those in as
    F1 = 0 capped the achievable score at 5/12 = 0.42 no matter how good the
    model was, and made a genuine improvement look like noise. Scoring a model
    on classes the test set cannot contain is not a harsh metric, it is a
    broken one.
    """
    pc = per_class(cm)
    f1 = pc["f1"]
    if present_only:
        present = pc["support"] > 0
        if present.any():
            return float(f1[present].mean())
    return float(f1.mean())


def accuracy(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float((y_true == y_pred).mean())


def expected_calibration_error(
    probs: np.ndarray, y_true: np.ndarray, n_bins: int = 10
) -> tuple[float, list[dict[str, float]]]:
    """
    ECE plus the reliability table behind it.

    Bucket predictions by their top-class confidence, then compare mean
    confidence against actual accuracy inside each bucket. A perfectly
    calibrated model sits on the diagonal; ECE is the support-weighted mean
    absolute gap from it.
    """
    conf = probs.max(axis=1)
    pred = probs.argmax(axis=1)
    correct = (pred == y_true).astype(np.float64)

    edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    table: list[dict[str, float]] = []

    for i in range(n_bins):
        lo, hi = edges[i], edges[i + 1]
        mask = (conf > lo) & (conf <= hi) if i > 0 else (conf >= lo) & (conf <= hi)
        n = int(mask.sum())
        if n == 0:
            continue
        avg_conf = float(conf[mask].mean())
        avg_acc = float(correct[mask].mean())
        ece += (n / len(conf)) * abs(avg_conf - avg_acc)
        table.append(
            {"lo": float(lo), "hi": float(hi), "n": n, "confidence": avg_conf, "accuracy": avg_acc}
        )

    return float(ece), table


def majority_baseline(y_train: np.ndarray, y_test: np.ndarray, k: int) -> dict[str, float]:
    """
    The bar every model has to clear.

    If a model cannot beat "always guess the most common class", it is not a
    model. Reporting this next to the result is what keeps the whole exercise
    honest.
    """
    majority = int(np.bincount(y_train, minlength=k).argmax())
    y_pred = np.full_like(y_test, majority)
    cm = confusion_matrix(y_test, y_pred, k)
    return {
        "accuracy": accuracy(y_test, y_pred),
        "macro_f1": macro_f1(cm),
        "class": majority,
    }


def report(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    labels: list[str],
    probs: np.ndarray | None = None,
) -> dict:
    k = len(labels)
    cm = confusion_matrix(y_true, y_pred, k)
    pc = per_class(cm)

    out = {
        "accuracy": accuracy(y_true, y_pred),
        "macro_f1": macro_f1(cm),
        "n_classes_present": int((pc["support"] > 0).sum()),
        "confusion": cm,
        "per_class": {
            labels[i]: {
                "precision": float(pc["precision"][i]),
                "recall": float(pc["recall"][i]),
                "f1": float(pc["f1"][i]),
                "support": int(pc["support"][i]),
            }
            for i in range(k)
        },
    }

    if probs is not None:
        ece, table = expected_calibration_error(probs, y_true)
        out["ece"] = ece
        out["reliability"] = table

    return out


def print_report(rep: dict, labels: list[str], title: str = "") -> None:
    if title:
        print(f"\n{title}")
        print("=" * len(title))
    print(f"  accuracy  {rep['accuracy']:.4f}")
    print(f"  macro-F1  {rep['macro_f1']:.4f}"
          + (f"   (over {rep['n_classes_present']} classes present)"
             if "n_classes_present" in rep else ""))
    if "ece" in rep:
        print(f"  ECE       {rep['ece']:.4f}")

    print(f"\n  {'class':<16}{'prec':>8}{'rec':>8}{'f1':>8}{'n':>8}")
    print(f"  {'-' * 48}")
    for name in labels:
        m = rep["per_class"][name]
        print(
            f"  {name:<16}{m['precision']:>8.3f}{m['recall']:>8.3f}"
            f"{m['f1']:>8.3f}{m['support']:>8d}"
        )
