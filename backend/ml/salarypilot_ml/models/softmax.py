"""
Multinomial logistic regression, written out in full.

Nothing here is imported from a machine-learning library. The forward pass,
the cross-entropy objective, the analytic gradient, the optimiser and the
temperature calibration are all implemented directly, because the point of
this model is to understand the mechanics rather than to call `.fit()`.

THE MATHS
---------
Given X (n x d), weights W (d x k) and bias b (k,):

    logits Z = XW + b
    P        = softmax(Z)                        row-wise
    L        = -1/n * sum_i w_{y_i} * log P[i, y_i]  +  (lam/2) * ||W||^2

The gradient of cross-entropy through softmax collapses to a famously clean
form. With per-class weights c_i applied to row i:

    dZ = (P - Y) * c   / n
    dW = X^T dZ + lam * W
    db = sum_rows(dZ)

That cancellation is the reason softmax and cross-entropy are always paired,
and deriving it is the single most useful thing in this file.

NUMERICAL CARE
--------------
softmax subtracts the row max before exponentiating. Without it, a logit of
~750 overflows float64 and the whole run turns into NaN - the classic failure,
and one that only shows up once the model starts fitting well.
"""

from __future__ import annotations

import numpy as np
from scipy import sparse


def softmax(Z: np.ndarray) -> np.ndarray:
    """Row-wise softmax, shifted for numerical stability."""
    Z = Z - Z.max(axis=1, keepdims=True)
    np.exp(Z, out=Z)
    Z /= Z.sum(axis=1, keepdims=True)
    return Z


class SoftmaxRegression:
    """
    Mini-batch SGD with Nesterov momentum and cosine learning-rate decay.

    Parameters
    ----------
    l2            : ridge penalty on W. The bias is deliberately unpenalised -
                    shrinking it just biases the class priors.
    class_weight  : 'balanced' reweights each class by n / (k * n_c). Without
                    this the model collapses onto `food`, which is roughly a
                    third of the corpus, and macro-F1 falls through the floor
                    even as accuracy looks respectable.
    """

    def __init__(
        self,
        n_classes: int,
        lr: float = 0.5,
        epochs: int = 30,
        batch_size: int = 256,
        l2: float = 1e-5,
        momentum: float = 0.9,
        class_weight: str | None = "balanced",
        seed: int = 0,
        verbose: bool = True,
    ) -> None:
        self.k = n_classes
        self.lr = lr
        self.epochs = epochs
        self.batch_size = batch_size
        self.l2 = l2
        self.momentum = momentum
        self.class_weight = class_weight
        self.seed = seed
        self.verbose = verbose

        self.W: np.ndarray | None = None
        self.b: np.ndarray | None = None
        self.temperature_: float = 1.0
        self.history_: list[dict[str, float]] = []

    # ── internals ───────────────────────────────────────────────────────
    def _class_weights(self, y: np.ndarray) -> np.ndarray:
        if self.class_weight != "balanced":
            return np.ones(self.k)
        counts = np.bincount(y, minlength=self.k).astype(np.float64)
        counts[counts == 0] = 1.0
        return len(y) / (self.k * counts)

    def _logits(self, X: sparse.csr_matrix) -> np.ndarray:
        return np.asarray(X @ self.W) + self.b

    # ── fit ─────────────────────────────────────────────────────────────
    def fit(
        self,
        X: sparse.csr_matrix,
        y: np.ndarray,
        X_val: sparse.csr_matrix | None = None,
        y_val: np.ndarray | None = None,
    ) -> "SoftmaxRegression":
        rng = np.random.default_rng(self.seed)
        n, d = X.shape

        # Small random init. All-zeros also works for a convex problem, but a
        # little asymmetry helps momentum get moving.
        self.W = rng.normal(0.0, 0.01, size=(d, self.k))
        self.b = np.zeros(self.k)

        vW = np.zeros_like(self.W)
        vb = np.zeros_like(self.b)

        cw = self._class_weights(y)
        Y = np.zeros((n, self.k))
        Y[np.arange(n), y] = 1.0

        for epoch in range(self.epochs):
            # Cosine decay: large steps early to cross the basin, small steps
            # late to settle instead of bouncing.
            lr = 0.5 * self.lr * (1 + np.cos(np.pi * epoch / self.epochs))

            order = rng.permutation(n)
            total_loss = 0.0
            seen = 0

            for start in range(0, n, self.batch_size):
                idx = order[start : start + self.batch_size]
                Xb = X[idx]
                Yb = Y[idx]
                yb = y[idx]
                m = len(idx)

                P = softmax(np.asarray(Xb @ self.W) + self.b)

                # Per-row weight from its true class.
                w_row = cw[yb][:, None]

                # Weighted cross-entropy on this batch.
                eps = 1e-12
                total_loss += float(
                    -(w_row[:, 0] * np.log(P[np.arange(m), yb] + eps)).sum()
                )
                seen += m

                # The clean gradient: (P - Y), scaled.
                dZ = (P - Yb) * w_row / m

                gW = Xb.T @ dZ
                gW = np.asarray(gW) + self.l2 * self.W
                gb = dZ.sum(axis=0)

                # Nesterov: step with the lookahead velocity.
                vW = self.momentum * vW - lr * gW
                vb = self.momentum * vb - lr * gb
                self.W += self.momentum * vW - lr * gW
                self.b += self.momentum * vb - lr * gb

            rec = {"epoch": epoch + 1, "loss": total_loss / max(1, seen), "lr": lr}
            if X_val is not None and y_val is not None:
                rec["val_acc"] = float((self.predict(X_val) == y_val).mean())
            self.history_.append(rec)

            if self.verbose and (epoch + 1) % 5 == 0:
                msg = f"  epoch {epoch + 1:3d}  loss {rec['loss']:.4f}"
                if "val_acc" in rec:
                    msg += f"  val_acc {rec['val_acc']:.4f}"
                print(msg)

        return self

    # ── inference ───────────────────────────────────────────────────────
    def predict_proba(self, X: sparse.csr_matrix) -> np.ndarray:
        return softmax(self._logits(X) / self.temperature_)

    def predict(self, X: sparse.csr_matrix) -> np.ndarray:
        return self._logits(X).argmax(axis=1)

    # ── calibration ─────────────────────────────────────────────────────
    def fit_temperature(self, X: sparse.csr_matrix, y: np.ndarray) -> float:
        """
        Temperature scaling (Guo et al., 2017).

        A trained classifier is usually over-confident: it says 0.95 and is
        right 0.80 of the time. One scalar T divides the logits before the
        softmax, fitted by minimising NLL on held-out data. It cannot change
        any prediction - argmax is invariant to positive scaling - so accuracy
        is untouched and only the confidences move.

        This matters for the product, not just the metric: the app shows a
        confidence next to each auto-categorised transaction, and a number
        that lies is worse than no number.
        """
        Z = self._logits(X)
        best_T, best_nll = 1.0, np.inf

        # Coarse-to-fine scan. The objective is 1-D and smooth; a scan is
        # clearer here than wiring up an optimiser.
        for T in np.concatenate([np.linspace(0.5, 5.0, 46), np.linspace(0.05, 0.5, 10)]):
            P = softmax(Z / T)
            nll = float(-np.log(P[np.arange(len(y)), y] + 1e-12).mean())
            if nll < best_nll:
                best_nll, best_T = nll, float(T)

        self.temperature_ = best_T
        return best_T

    # ── persistence ─────────────────────────────────────────────────────
    def save(self, path: str) -> None:
        np.savez_compressed(
            path, W=self.W, b=self.b, temperature=np.array([self.temperature_])
        )

    @classmethod
    def load(cls, path: str, n_classes: int) -> "SoftmaxRegression":
        z = np.load(path)
        m = cls(n_classes=n_classes)
        m.W, m.b = z["W"], z["b"]
        m.temperature_ = float(z["temperature"][0])
        return m
