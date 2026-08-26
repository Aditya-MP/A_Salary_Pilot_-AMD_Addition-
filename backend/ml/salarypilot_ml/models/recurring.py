"""
M2 - Recurring payment detection.

Finds the subscriptions, EMIs and standing commitments hiding in a transaction
stream. Replaces the hardcoded `subscriptions[]` array that Leak Hunter reads
in the frontend.

WHY THIS IS UNSUPERVISED, AND WHY THAT MATTERS
----------------------------------------------
There are no labels here and none are needed. Regularity is a property of the
timestamps themselves, so this works on a brand-new user's first import with
nothing trained in advance. That is the opposite of M1's cold-start problem,
and the two are complementary: M2 needs no history about the world, only
history about this account.

THE METHOD
----------
Three stages, each doing one job:

1. RESOLVE   Group transactions that are the same merchant wearing different
             narration clothes. `NETFLIX`, `NETFLIX.COM` and `ACH-D-NETFLIX`
             are one series; the grouping is Jaccard similarity over character
             4-grams of a stripped fingerprint, joined with union-find.

2. PERIOD    Estimate the interval from the autocorrelation of a daily event
             series, computed by FFT. Autocorrelation is used rather than the
             mean gap because it is robust to a missed month: if a payment
             fails and retries, the mean gap is wrecked while the dominant
             periodicity survives.

3. SCORE     Combine how tightly the gaps cluster with how stable the amounts
             are. Both use median and MAD rather than mean and standard
             deviation, because a single annual renewal inside a monthly
             series will drag a mean anywhere it likes.

A false positive here is expensive - the product would be telling somebody to
cancel their rent - so the thresholds are set to favour precision.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np

# Canonical billing intervals, in days. Real-world series snap to these.
CANONICAL = {
    "weekly": 7.0,
    "fortnightly": 14.0,
    "monthly": 30.44,
    "quarterly": 91.31,
    "half-yearly": 182.62,
    "annual": 365.25,
}

# Channel scaffolding that carries no merchant identity.
_NOISE = re.compile(
    r"\b(UPI|DR|CR|POS|VISA|NEFT|ACH|NACH|IB|FUNDS|TRANSFER|PAYMENT|BY|TO|"
    r"REF|MANDATE|CARD|ATM|WDL|P2M|CREDIT|IN|LTD|PVT|INDIA|TECHNOLOGIES|"
    r"XXXXXXXX)\b",
    re.I,
)
_AGGREGATOR = re.compile(r"^(PAYU|RAZORPAY|BILLDESK|CCAVENUE|PYTM|PHONEPE|ACI|FKRT)\*?", re.I)
_CITIES = re.compile(
    r"\b(BANGALORE|BENGALURU|MUMBAI|PUNE|HYDERABAD|GURGAON|BLR|MUM)\b", re.I
)


def fingerprint(narration: str) -> str:
    """
    Reduce a narration to whatever identifies the merchant.

    Strips channel boilerplate, city names, reference numbers, bank codes and
    aggregator prefixes, then keeps the alphabetic remainder. Deliberately
    lossy - the goal is that two narrations for the same merchant collide, not
    that the result is readable.
    """
    s = narration.upper()
    s = re.sub(r"[0-9]+", " ", s)          # reference numbers
    s = re.sub(r"@\S+", " ", s)            # UPI handles
    s = _AGGREGATOR.sub(" ", s)
    s = re.sub(r"[^A-Z]+", " ", s)
    s = _NOISE.sub(" ", s)
    s = _CITIES.sub(" ", s)
    # Single characters are debris left over from stripping digits out of
    # alphanumeric codes.
    return " ".join(t for t in s.split() if len(t) > 1)


def _grams(s: str, n: int = 4) -> set[str]:
    s = s.replace(" ", "")
    if len(s) < n:
        return {s} if s else set()
    return {s[i : i + n] for i in range(len(s) - n + 1)}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / (len(a) + len(b) - inter)


def _containment(a: set[str], b: set[str]) -> float:
    """How much of the smaller set is inside the larger."""
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def _tokens(s: str) -> set[str]:
    return {t for t in s.split() if len(t) >= 5}


def resolve_merchants(
    narrations: list[str],
    jaccard_threshold: float = 0.34,
    containment_threshold: float = 0.72,
) -> list[int]:
    """
    Cluster narrations into merchant groups. Returns a group id per input.

    Union-find over three linking rules, because Jaccard alone was badly
    insufficient: at a 0.45 threshold, 77 of 80 merchants fragmented and
    `ZOMATO` alone split into 22 separate groups. Fragmentation is fatal for
    M2 - a monthly series broken into four pieces has too few points left in
    any piece to show a period.

    The three rules:

      jaccard      overall 4-gram overlap, for ordinary spelling drift
      containment  most of the smaller fingerprint sits inside the larger,
                   which is what truncation and suffixes actually look like:
                   `NETFLIX` inside `NETFLIX ENTERTAIN`
      shared token a distinctive token of five or more characters in common,
                   which catches `ZOMATO LTD` and `ZOMATO MEDIA`

    HONEST LIMIT
    ------------
    No amount of string similarity will ever link `SWIGGY` to `BUNDL
    TECHNOLOGIES`, its registered entity - they share no characters. That
    mapping is knowledge about the world, not a property of the string, and
    production systems buy it as a merchant directory. Everything here is the
    best that can be done without one, and the residual error is reported
    rather than hidden.
    """
    fps = [fingerprint(n) for n in narrations]
    uniq = sorted(set(fps))
    grams = {f: _grams(f) for f in uniq}
    toks = {f: _tokens(f) for f in uniq}

    parent = list(range(len(uniq)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[max(ri, rj)] = min(ri, rj)

    for i in range(len(uniq)):
        gi, ti = grams[uniq[i]], toks[uniq[i]]
        for j in range(i + 1, len(uniq)):
            gj, tj = grams[uniq[j]], toks[uniq[j]]
            if (
                _jaccard(gi, gj) >= jaccard_threshold
                or _containment(gi, gj) >= containment_threshold
                or (ti & tj)
            ):
                union(i, j)

    root_of = {f: find(i) for i, f in enumerate(uniq)}
    return [root_of[f] for f in fps]


def autocorrelation(x: np.ndarray) -> np.ndarray:
    """
    Normalised autocorrelation via FFT.

    Direct computation is O(n^2); through the Wiener-Khinchin theorem - the
    ACF is the inverse transform of the power spectrum - it is O(n log n).
    Zero-padding to 2n prevents the circular wrap-around that would otherwise
    fold the end of the series onto its beginning and invent periodicity that
    is not there.
    """
    n = len(x)
    x = x - x.mean()
    if np.allclose(x, 0):
        return np.zeros(n)

    size = 1 << (2 * n - 1).bit_length()
    f = np.fft.rfft(x, n=size)
    acf = np.fft.irfft(f * np.conj(f), n=size)[:n]

    if acf[0] <= 0:
        return np.zeros(n)
    return acf / acf[0]


def dominant_period(days: list[int], span: int, min_lag: int = 5) -> tuple[float, float]:
    """
    Estimate the interval of an event series.

    `days` are day-offsets from the first observation, `span` the total window.
    Returns (period_days, acf_strength).

    Falls back to the median gap when the window is too short for the ACF to
    have anything to lock onto - which is the common case for an annual
    subscription seen over eighteen months.
    """
    if len(days) < 3:
        return 0.0, 0.0

    series = np.zeros(span + 1)
    for d in days:
        if 0 <= d <= span:
            series[d] = 1.0

    acf = autocorrelation(series)
    hi = min(len(acf) - 1, span // 2)
    if hi <= min_lag:
        gaps = np.diff(sorted(days))
        return (float(np.median(gaps)), 0.0) if len(gaps) else (0.0, 0.0)

    window = acf[min_lag : hi + 1]
    if len(window) == 0 or window.max() <= 0:
        gaps = np.diff(sorted(days))
        return (float(np.median(gaps)), 0.0) if len(gaps) else (0.0, 0.0)

    peak = float(window.max())

    # Take the FUNDAMENTAL period, not the loudest harmonic.
    #
    # The autocorrelation of a periodic series peaks at every multiple of the
    # true period, and any of those multiples can be the global maximum. Taking
    # argmax reported Netflix - a clean 30-day subscription - as a 90-day
    # quarterly series, because the peak at lag 90 happened to edge out the one
    # at lag 30. Scanning upward for the first peak that clears a fraction of
    # the maximum recovers the true cycle. This is the standard fix in pitch
    # detection, where the identical failure makes a note sound an octave low.
    strong = 0.72 * peak
    for k in range(1, len(window) - 1):
        if window[k] >= strong and window[k] >= window[k - 1] and window[k] >= window[k + 1]:
            return float(k + min_lag), float(window[k])

    return float(int(np.argmax(window)) + min_lag), peak


def group_series(txns, amount_tolerance: float = 0.04) -> dict[int, list]:
    """
    Group transactions into candidate series by AMOUNT first, name second.

    WHY THIS REPLACED NAME-FIRST GROUPING
    -------------------------------------
    Resolving merchants by string similarity hit a hard ceiling: even after
    adding containment and shared-token rules, 54 of 80 merchants still
    fragmented, and a monthly series split into four pieces has too few points
    left to show a period. The remaining errors were not fixable by tuning,
    because `SWIGGY` and `BUNDL TECHNOLOGIES` share no characters at all.

    The insight is that M2 never needed to know WHO the merchant is. It needs
    groups of transactions of the same size arriving on a schedule. Netflix at
    649 rupees every month is findable from (amount, gap) alone, no matter how
    the bank spelled it - and amount is the single most stable property a
    subscription has, precisely because subscriptions have fixed prices.

    So amount leads and the name is only used to SPLIT clusters, preventing two
    unrelated merchants that happen to cost the same from being merged. Using
    the weaker signal to subdivide rather than to group is what makes this
    robust to narration noise.
    """
    order = sorted(range(len(txns)), key=lambda i: txns[i].amount)
    fps = [fingerprint(t.narration) for t in txns]
    grams = [_grams(f) for f in fps]
    toks = [_tokens(f) for f in fps]

    # Stage A - greedy amount clusters. Consecutive amounts within tolerance
    # of the running cluster median join it.
    clusters: list[list[int]] = []
    current: list[int] = []
    anchor = 0.0
    for i in order:
        a = txns[i].amount
        if current and anchor > 0 and abs(a - anchor) / anchor <= amount_tolerance:
            current.append(i)
        else:
            if current:
                clusters.append(current)
            current = [i]
            anchor = a
    if current:
        clusters.append(current)

    # Stage B - split each amount cluster into connected components by name
    # similarity, so two different vendors at the same price stay separate.
    out: dict[int, list] = {}
    gid = 0
    for cluster in clusters:
        parent = {i: i for i in cluster}

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for pos, i in enumerate(cluster):
            for j in cluster[pos + 1 :]:
                if (
                    _jaccard(grams[i], grams[j]) >= 0.30
                    or _containment(grams[i], grams[j]) >= 0.70
                    or (toks[i] & toks[j])
                ):
                    ri, rj = find(i), find(j)
                    if ri != rj:
                        parent[rj] = ri

        comps: dict[int, list] = {}
        for i in cluster:
            comps.setdefault(find(i), []).append(i)

        for members in comps.values():
            out[gid] = [txns[i] for i in members]
            gid += 1

    return out


@dataclass
class RecurringSeries:
    group_id: int
    label: str
    n: int
    period_days: float
    cadence: str
    amount: float
    amount_cv: float
    regularity: float
    confidence: float
    last_seen: date
    next_expected: date
    is_recurring: bool


def _cadence(period: float) -> tuple[str, float]:
    """Snap an estimated period to the nearest canonical billing interval."""
    best, best_err = "irregular", math.inf
    for name, days in CANONICAL.items():
        err = abs(period - days) / days
        if err < best_err:
            best, best_err = name, err
    # Beyond 18% off the nearest canonical interval it is not a billing cycle,
    # it is just a merchant somebody happens to visit often.
    return (best, best_err) if best_err <= 0.18 else ("irregular", best_err)


def detect(
    txns,
    min_occurrences: int = 6,
    min_confidence: float = 0.55,
    max_amount_cv: float = 0.22,
) -> list[RecurringSeries]:
    """
    Find recurring series in a transaction list.

    `txns` need `.day` (date), `.amount` (float) and `.narration` (str).

    TWO CORRECTIONS THAT MATTERED MORE THAN THE ALGORITHM
    -----------------------------------------------------
    `min_occurrences` was 3, and three points are not evidence of a cycle -
    any three dates fit some period exactly, so short series manufactured
    confident nonsense. Six is the point where a monthly claim starts to mean
    something.

    `max_amount_cv` is a hard gate rather than a soft weight in the score. A
    subscription has a fixed price; that is what makes it a subscription. A
    merchant whose amount swings by more than ~22% is a place somebody shops,
    not a standing commitment, however regularly they visit. Previously this
    only nudged the confidence down and Swiggy could still out-score Netflix.

    Grouping is by resolved merchant name. An earlier version keyed on amount
    instead - correct in spirit for fixed-price subscriptions, and much worse
    in practice: it shattered variable-amount merchants into dozens of
    three-transaction clusters and precision fell from 0.47 to 0.18. Amount is
    the right FILTER and the wrong KEY.
    """
    if not txns:
        return []

    groups = resolve_merchants([t.narration for t in txns])
    buckets: dict[int, list] = {}
    for gid, t in zip(groups, txns):
        buckets.setdefault(gid, []).append(t)

    first_day = min(t.day for t in txns)
    span = (max(t.day for t in txns) - first_day).days

    out: list[RecurringSeries] = []
    for gid, items in buckets.items():
        if len(items) < min_occurrences:
            continue

        items.sort(key=lambda t: t.day)
        offsets = [(t.day - first_day).days for t in items]
        amounts = np.array([t.amount for t in items], dtype=np.float64)

        period, acf_strength = dominant_period(offsets, span)
        if period <= 0:
            continue

        cadence, period_err = _cadence(period)

        # Regularity from the gaps, using MAD rather than the standard
        # deviation. One missed renewal inside an otherwise perfect monthly
        # series should not destroy the score, and with a mean it would.
        gaps = np.diff(offsets).astype(np.float64)
        if len(gaps) == 0:
            continue
        med_gap = float(np.median(gaps))
        if med_gap <= 0:
            continue
        mad_gap = float(np.median(np.abs(gaps - med_gap)))
        regularity = max(0.0, 1.0 - (mad_gap / med_gap))

        # Amount stability, robust for the same reason.
        med_amt = float(np.median(amounts))
        mad_amt = float(np.median(np.abs(amounts - med_amt)))
        amount_cv = (mad_amt / med_amt) if med_amt > 0 else 1.0
        amount_stability = max(0.0, 1.0 - min(1.0, amount_cv * 3))

        # More observations is more evidence, with diminishing returns.
        support = min(1.0, math.log1p(len(items)) / math.log1p(12))

        cadence_fit = 0.0 if cadence == "irregular" else max(0.0, 1.0 - period_err / 0.18)

        # acf_strength was previously computed and then thrown away - a real
        # bug, and the reason a salary credit landing on random days could be
        # reported as an annual series with 0.72 confidence. The peak height of
        # the autocorrelation is precisely the evidence that a period exists at
        # all: white noise has no strong peak, so weighting it in is what
        # separates a genuine cycle from a coincidence.
        periodicity = min(1.0, max(0.0, acf_strength) / 0.35)

        confidence = (
            0.28 * regularity
            + 0.24 * amount_stability
            + 0.20 * cadence_fit
            + 0.20 * periodicity
            + 0.08 * support
        )

        last = items[-1].day
        out.append(
            RecurringSeries(
                group_id=gid,
                label=fingerprint(items[-1].narration) or "unknown",
                n=len(items),
                period_days=period,
                cadence=cadence,
                amount=med_amt,
                amount_cv=amount_cv,
                regularity=regularity,
                confidence=confidence,
                last_seen=last,
                next_expected=last + timedelta(days=int(round(med_gap))),
                is_recurring=(
                    confidence >= min_confidence
                    and cadence != "irregular"
                    # The hard gate. A standing commitment has a fixed price.
                    and amount_cv <= max_amount_cv
                ),
            )
        )

    out.sort(key=lambda s: -s.confidence)
    return out
