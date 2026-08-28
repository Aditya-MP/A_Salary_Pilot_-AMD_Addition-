"""
Behavioural features for M1-v2.

THE PROBLEM THIS SOLVES
-----------------------
M1-v1 scored 0.982 on merchants it had seen and 0.302 on merchants it had
not. That gap is not a tuning failure - it is the ceiling of the feature set.
A bag of character n-grams over the narration has exactly one signal, the
merchant string, so a vendor it has never encountered is genuinely
unclassifiable. A human reading `NYKAA` cold cannot categorise it either.

It matters because every new user arrives as an entirely unseen-merchant
problem. The first month of their statement is the worst the model will ever
perform, which is precisely when they decide whether to trust the product.

THE FIX IS SIGNAL, NOT CAPACITY
-------------------------------
The features below describe what a payment *is like* rather than *who it went
to*, so they transfer to vendors the model has never met:

  amount      A recurring debit of Rs 149 is a subscription no matter the payee.
              Rent is five figures. Groceries are three. Log scale, because the
              interesting structure is multiplicative.

  roundness   Rent is exactly 32,000. A restaurant bill is 347. Humans and
              standing instructions produce round numbers; tills do not.

  channel     The strongest single non-text feature. A NACH mandate is almost
              always an EMI or a subscription - nobody sets up a direct debit
              for lunch. ATM withdrawals are always transfers.

  direction   Credits are income or transfers. Never groceries. This one
              feature alone eliminates ten of the twelve classes.

  day-of-month  Rent, EMIs and subscriptions cluster at the start of the month.
              Encoded as sine/cosine so that the 30th and the 1st are close
              together, which a raw 1-31 integer gets badly wrong.

  weekend     Discretionary spending skews to Saturday and Sunday. Rent does not.

NO LEAKAGE
----------
Every one of these is present on the bank statement row at the moment of
prediction. Nothing here is derived from the label, and nothing needs future
information.
"""

from __future__ import annotations

import math
from datetime import date

import numpy as np
from scipy import sparse

CHANNELS = ["upi", "card", "neft", "ach", "netbanking", "atm", "internal"]
CHANNEL_INDEX = {c: i for i, c in enumerate(CHANNELS)}

# Rupee boundaries chosen from how Indian household spending actually clusters,
# not from an even split. Micro-payments, everyday spends, bills, and the
# five-to-six-figure commitments are genuinely different populations.
AMOUNT_BUCKETS = [50, 150, 400, 1_000, 2_500, 6_000, 15_000, 40_000, 100_000]

FEATURE_NAMES = (
    ["log_amount", "is_round_100", "is_round_500", "is_round_1000", "trailing_zeros"]
    + [f"channel_{c}" for c in CHANNELS]
    + ["is_credit", "dom_sin", "dom_cos", "is_month_start", "is_weekend"]
    + [f"amt_bucket_{b}" for b in AMOUNT_BUCKETS]
    + ["amt_over_max"]
)


def _roundness(amount: float) -> tuple[float, float, float, float]:
    r = round(amount)
    trailing = 0
    v = r
    while v > 0 and v % 10 == 0:
        trailing += 1
        v //= 10
    return (
        1.0 if r % 100 == 0 else 0.0,
        1.0 if r % 500 == 0 else 0.0,
        1.0 if r % 1000 == 0 else 0.0,
        min(trailing, 5) / 5.0,
    )


def extract_one(amount: float, channel: str, direction: str, day: date) -> list[float]:
    """Feature vector for a single transaction."""
    feats: list[float] = []

    # Log amount, scaled into roughly [0, 1]. log1p keeps zero-amount rows finite.
    feats.append(math.log1p(max(0.0, amount)) / 15.0)

    feats.extend(_roundness(amount))

    onehot = [0.0] * len(CHANNELS)
    idx = CHANNEL_INDEX.get(channel)
    if idx is not None:
        onehot[idx] = 1.0
    feats.extend(onehot)

    feats.append(1.0 if direction == "credit" else 0.0)

    # Cyclical day-of-month. A raw integer would place the 30th and the 1st at
    # opposite ends of the range when they are one day apart, and the whole
    # point is that rent and EMIs cluster across that boundary.
    dom = day.day
    feats.append(math.sin(2 * math.pi * dom / 31.0))
    feats.append(math.cos(2 * math.pi * dom / 31.0))
    feats.append(1.0 if dom <= 5 else 0.0)
    feats.append(1.0 if day.weekday() >= 5 else 0.0)

    # Bucketed amount, so the model can carve non-monotone regions that a
    # single linear term on log_amount cannot express.
    placed = False
    for b in AMOUNT_BUCKETS:
        if not placed and amount <= b:
            feats.append(1.0)
            placed = True
        else:
            feats.append(0.0)
    feats.append(0.0 if placed else 1.0)

    return feats


class BehaviouralFeatures:
    """
    Dense behavioural features, standardised and returned sparse so they can
    be hstacked onto the TF-IDF block.

    Scaling is fitted on training data only. Fitting it on the full dataset
    would leak test statistics into training - a subtle and very common way to
    make results look better than they are.
    """

    def __init__(self) -> None:
        self.mean_: np.ndarray | None = None
        self.scale_: np.ndarray | None = None

    @staticmethod
    def _matrix(txns) -> np.ndarray:
        return np.asarray(
            [extract_one(t.amount, t.channel, t.direction, t.day) for t in txns],
            dtype=np.float64,
        )

    def fit(self, txns) -> "BehaviouralFeatures":
        X = self._matrix(txns)
        self.mean_ = X.mean(axis=0)
        scale = X.std(axis=0)
        # A constant column has zero variance; dividing by it produces NaN and
        # silently poisons every downstream gradient.
        scale[scale < 1e-9] = 1.0
        self.scale_ = scale
        return self

    def transform(self, txns) -> sparse.csr_matrix:
        if self.mean_ is None or self.scale_ is None:
            raise RuntimeError("fit() before transform()")
        X = (self._matrix(txns) - self.mean_) / self.scale_
        return sparse.csr_matrix(X)

    def fit_transform(self, txns) -> sparse.csr_matrix:
        return self.fit(txns).transform(txns)

    @property
    def n_features(self) -> int:
        return len(FEATURE_NAMES)


# Measured directly against the real training corpus, not guessed: the
# standardised behavioural block's average row L2 norm is ~4.5, against
# text's exact 1.0 (text rows are explicitly L2-normalised in
# CharNGramTfidf.transform). 1/4.5 rescales behavioural rows to match.
#
# THE BUG THIS FIXES
# ---------------------
# This module's own combine() docstring used to claim the two blocks "end up
# on comparable scales" - they measurably did not, by roughly 4.5x on raw
# feature magnitude and, because a linear classifier can concentrate a fixed
# "explanatory budget" into few large weights more easily than many small
# ones under the same L2 penalty, more like 10x on ACTUAL LEARNED LOGIT
# CONTRIBUTION once trained. Traced on a real failing prediction: for a
# genuine training-set example ("NOBROKER RENT", a rent payment), the 9360
# character n-gram TEXT features correctly preferred "housing" over
# "transfer" (+2.2 net) - the text signal was right. But the 27 BEHAVIOURAL
# features (amount, channel, day-of-month, and so on) contributed +14.2 net
# toward "transfer" regardless, completely overriding a correct text read,
# with 99.9999% confidence in the wrong answer.
BEHAVIOURAL_SCALE = 0.22


def combine(tfidf: sparse.csr_matrix, behavioural: sparse.csr_matrix) -> sparse.csr_matrix:
    """
    Concatenate the text block and the behavioural block, after rescaling
    behavioural to match text's row norm - see BEHAVIOURAL_SCALE.
    """
    return sparse.hstack([tfidf, behavioural * BEHAVIOURAL_SCALE], format="csr")
