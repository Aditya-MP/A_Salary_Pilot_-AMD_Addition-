"""
Time-series evaluation.

THE ONE RULE
------------
Never split a time series at random. A random split lets the model train on
Thursday to predict Wednesday, which inflates every metric and cannot happen
in production. Everything here uses walk-forward origin evaluation: fit on
everything up to time t, forecast forward, roll t along, repeat. It is the
first thing worth checking in anybody's forecasting code, including my own.

WHY MASE IS THE HEADLINE
------------------------
MAPE, the usual choice, divides by the actual value - and daily spend is
frequently zero, which makes it infinite. It is also asymmetric: it punishes
over-forecasting far more than under-forecasting, so it quietly rewards models
that predict low.

MASE divides the model's error by the error a seasonal-naive forecast makes on
the same data. That makes it scale-free, defined at zero, and directly
interpretable:

    MASE < 1   better than seasonal naive
    MASE = 1   no better than repeating last month
    MASE > 1   worse than doing nothing clever
"""

from __future__ import annotations

import numpy as np


def mae(actual: np.ndarray, pred: np.ndarray) -> float:
    return float(np.mean(np.abs(actual - pred)))


def rmse(actual: np.ndarray, pred: np.ndarray) -> float:
    return float(np.sqrt(np.mean((actual - pred) ** 2)))


def smape(actual: np.ndarray, pred: np.ndarray) -> float:
    """
    Symmetric MAPE, as a percentage.

    Denominator guarded so that days with no spending at all do not produce
    a division by zero and poison the mean.
    """
    denom = (np.abs(actual) + np.abs(pred)) / 2.0
    mask = denom > 1e-9
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs(actual[mask] - pred[mask]) / denom[mask]) * 100)


def mase(actual: np.ndarray, pred: np.ndarray, train: np.ndarray, m: int) -> float:
    """
    Mean absolute scaled error.

    The scaling term is the in-sample MAE of a seasonal-naive forecast, which
    is what makes the number comparable across series of wildly different
    magnitudes - daily food spend and monthly rent live on the same scale here.
    """
    if len(train) <= m:
        return float("nan")
    scale = float(np.mean(np.abs(train[m:] - train[:-m])))
    if scale < 1e-9:
        return float("nan")
    return mae(actual, pred) / scale


def coverage(actual: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> float:
    """Fraction of actuals inside the interval. For a 90% band, want ~0.90."""
    return float(np.mean((actual >= lo) & (actual <= hi)))


def interval_width(lo: np.ndarray, hi: np.ndarray) -> float:
    """
    Mean band width.

    Always reported next to coverage, because coverage on its own is trivially
    gamed: an interval from minus infinity to plus infinity has perfect
    coverage and zero value. The pair together is the honest summary.
    """
    return float(np.mean(hi - lo))


def walk_forward_origins(
    n: int, horizon: int, min_train: int, step: int
) -> list[tuple[int, int]]:
    """
    Origins for rolling-origin evaluation.

    Returns (train_end, test_end) pairs. Each fit sees only data strictly
    before train_end, so there is no way for future information to leak
    backwards.
    """
    out: list[tuple[int, int]] = []
    t = min_train
    while t + horizon <= n:
        out.append((t, t + horizon))
        t += step
    return out


def summarise(name: str, errs: dict[str, list[float]]) -> dict[str, float]:
    out: dict[str, float] = {"model": name}
    for k, v in errs.items():
        arr = np.array([x for x in v if np.isfinite(x)], dtype=np.float64)
        out[k] = float(arr.mean()) if len(arr) else float("nan")
        out[k + "_std"] = float(arr.std()) if len(arr) else float("nan")
    return out
