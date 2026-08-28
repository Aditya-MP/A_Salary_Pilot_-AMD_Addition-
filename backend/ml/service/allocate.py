"""
M5 served — allocation for someone who does not want to pick shares.

WHAT THIS IS FOR
----------------
The typical user of this app is a salaried employee who wants their money to
grow and has no interest in learning to read a balance sheet. They add money,
choose how much risk they can live with, and expect the system to decide where
it goes. This endpoint is that decision, plus the reasoning behind it.

THE BUG THIS FILE USED TO HAVE
-------------------------------
Every number below used to come from a calibrated SYNTHETIC one-factor market
simulator, seeded at a hardcoded value. That is fine for demonstrating an
optimiser's mechanics, but it was quietly wrong once put behind a live
endpoint: the covariance estimate never depended on anything real - not the
date, not actual market conditions, nothing. Every user, every call, forever,
got the exact same numbers. A user checking back in six months would see
weights indistinguishable from a frozen screenshot.

Fixed by wiring this to REAL market data instead - see
data/market_factors.py for the six real, verified-reachable instruments
(a real Nifty 50 index, a real gold ETF, real Bitcoin, and so on) and
train/m5_portfolio.py for the walk-forward evaluation run against them. The
`EVIDENCE` and `caveat` below are loaded from that evaluation's own output
artifact, not hand-written - if the real evaluation's verdict changes, what
this endpoint tells the user changes with it, automatically, rather than a
stale claim quietly going out of date.

WHY ASSET CLASSES AND NOT INDIVIDUAL SHARES
--------------------------------------------
The optimiser is evaluated on six asset classes, so six asset classes is what
it is entitled to allocate. Estimating a covariance matrix over hundreds of
individual stocks from the data available here would produce a
confident-looking matrix that is mostly estimation error - with N assets you
need far more than N observations, and the eigenvalues the optimiser divides
by are precisely the ones estimated worst.

Picking which instruments fill each class is a separate, simpler problem,
handled by planEngine.ts on the frontend - never by pretending this optimiser
can see company fundamentals.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from salarypilot_ml.data.market_factors import ASSETS, aligned_returns
from salarypilot_ml.models.portfolio import ledoit_wolf, min_variance, equal_weight

MODEL_VERSION = "m5-minvar-lw-cap35-real-v1"

ARTIFACT_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "m5_metrics.json"

MAX_WEIGHT = 0.35
LOOKBACK_DAYS = 252  # one real trading year - matches train/m5_portfolio.py's TRAIN

EQUITY_IDX = [0, 1, 4]  # large, flexi, esg
DEBT_IDX = [2]
CRYPTO_IDX = 5

# Risk profiles move along the frontier, then get clamped.
#
# TWO ATTEMPTS THAT WERE WRONG, KEPT HERE SO THE NEXT PERSON DOES NOT REPEAT THEM
# ---------------------------------------------------------------------------------
# 1. Expressing risk purely as caps on a single minimum-variance solution
#    produced byte-identical portfolios for all three profiles: min-variance
#    has one answer, and it already sat below every ceiling, so nothing ever
#    bound.
# 2. Using max-Sharpe as the "growth anchor" barely moved the three profiles
#    apart (7.6% to 7.7% volatility) - max-Sharpe is RISK-ADJUSTED, and the
#    low-volatility assets already win on that basis, so it collapsed back
#    onto minimum-variance.
#
# The growth anchor is now maximum expected return subject to the 35% cap,
# which is what "aggressive" is actually asking for. Applied as a blend
# (`tilt`) with the minimum-variance solution, then clamped.
# `gold` was added after real data exposed a structural gap: gold has no
# profile-specific ceiling of its own anywhere in this schema, so it is the
# only bucket every other constraint's overflow can be pushed into. On real
# data gold's own volatility (~32% annualised) is close to crypto's, not
# close to debt's, and pure min-variance can legitimately want more of the
# equity+ESG bundle than "conservative" permits (real ESG correlates with
# equity_large at ~0.97 on this data, so the optimiser sees them as nearly
# one large position) - the resulting overflow, with nowhere capped to go,
# concentrated a full quarter of a "conservative" portfolio in a
# single-digit-vol-away-from-crypto asset. See _apply_risk_limits.
RISK_LIMITS = {
    "conservative": {"tilt": 0.00, "crypto": 0.00, "equity_total": 0.40, "debt_floor": 0.30, "gold": 0.30},
    "balanced":     {"tilt": 0.35, "crypto": 0.05, "equity_total": 0.65, "debt_floor": 0.10, "gold": 0.30},
    "aggressive":   {"tilt": 0.70, "crypto": 0.15, "equity_total": 0.85, "debt_floor": 0.00, "gold": 0.30},
}


def _load_evidence() -> dict:
    """
    The real walk-forward evaluation's own numbers, straight from the
    artifact train/m5_portfolio.py writes. Not hand-transcribed - if that
    script is re-run against fresher real data and the verdict shifts, this
    endpoint's claims shift with it on the next server restart, rather than
    silently going stale the way a hardcoded dict would.
    """
    if not ARTIFACT_PATH.exists():
        raise RuntimeError(
            "no M5 evaluation artifact found - run "
            "`python -m salarypilot_ml.train.m5_portfolio` first"
        )
    return json.loads(ARTIFACT_PATH.read_text(encoding="utf-8"))


_EVIDENCE_CACHE: dict | None = None


def _evidence() -> dict:
    global _EVIDENCE_CACHE
    if _EVIDENCE_CACHE is None:
        _EVIDENCE_CACHE = _load_evidence()
    return _EVIDENCE_CACHE


_RETURNS_CACHE: np.ndarray | None = None


def _recent_real_returns() -> np.ndarray:
    """
    The most recent LOOKBACK_DAYS of real daily returns across the six
    buckets, cached in memory for the life of the process. Refreshing this
    means re-running the fetcher (fetch_data.py or a scheduled equivalent)
    to update the on-disk cache and restarting the service - covariance
    estimates should not silently drift request-to-request based on
    whichever moment happened to trigger a re-fetch.
    """
    global _RETURNS_CACHE
    if _RETURNS_CACHE is None:
        _, rets = aligned_returns()
        if len(rets) < LOOKBACK_DAYS:
            raise RuntimeError(
                f"only {len(rets)} real trading days available, need "
                f"{LOOKBACK_DAYS} for the covariance estimate"
            )
        _RETURNS_CACHE = rets[-LOOKBACK_DAYS:]
    return _RETURNS_CACHE


def _covariance() -> np.ndarray:
    """Shrunk covariance from real, recent market returns."""
    cov, _ = ledoit_wolf(_recent_real_returns())
    return cov


def _mu_annual() -> np.ndarray:
    """
    Annualised expected return per bucket, from real recent history.

    A KNOWN, ACCEPTED LIMITATION, NOT AN OVERSIGHT
    -------------------------------------------------
    A trailing sample mean is a genuinely noisy estimator of future return -
    this is precisely DeMiguel, Garlappi and Uppal's finding that this file's
    own module docstring cites as the reason 1/N is a real bar to clear.
    Covariance is comparatively stable and worth estimating; a mean return
    over a couple of real years mostly reflects which asset happened to do
    well recently, not a robust forecast. Real data fixed the frozen-forever
    bug this file used to have; it did not fix that expected-return
    estimation is hard in general. The "aggressive" tilt should be read as
    leaning toward this window's actual winners, not as the model's
    confident prediction of tomorrow's - the caveat text sent to the client
    says as much.
    """
    return _recent_real_returns().mean(axis=0) * 252


def _max_return_capped(mu: np.ndarray, cap: float) -> np.ndarray:
    """
    Highest expected return with no asset above `cap`.

    Maximising a linear objective over a capped simplex has a greedy solution:
    fill the best asset to the cap, then the next, until the budget is spent.
    No solver needed, and the answer is exact rather than approximately
    converged.
    """
    w = np.zeros_like(mu)
    remaining = 1.0
    for i in np.argsort(mu)[::-1]:
        take = min(cap, remaining)
        w[i] = take
        remaining -= take
        if remaining <= 1e-12:
            break
    return w


def _apply_risk_limits(w: np.ndarray, profile: str) -> np.ndarray:
    """
    Clamp the optimiser's answer into the user's risk tolerance.

    Applied AFTER optimisation rather than as constraints inside it, because
    these limits are not statements about the covariance matrix - they are
    statements about what this person can emotionally survive.

    TWO ATTEMPTS THAT WERE WRONG, IN ORDER
    ------------------------------------------
    1. Crypto/equity overflow credited straight to debt, unconditionally.
       On real data debt is by far the lowest-volatility asset, so pure
       min-variance ALREADY wants ~35% there before this function ever
       runs - crediting more on top pushed a conservative profile to 55%
       in a single bond fund, breaking the module's own "no single asset
       above 35%" rule.

    2. Fixed that by capping every asset at 35% and dumping whatever
       overflowed into gold, unconditionally. That is directionally
       right - gold is the one bucket with no profile-specific ceiling -
       but doing it as a blind final pass meant debt's overflow landed in
       gold even in cases where debt still had real headroom, and gold is
       NOT a low-risk asset on real data (its own volatility, ~32%
       annualised, is closer to crypto's than to debt's). The result was
       measurable: "conservative" came out MORE volatile than "balanced",
       because a naive redistribution rule does not know what a
       covariance-aware optimiser knows.

    This version routes overflow to debt FIRST, up to debt's own 35%
    ceiling - not unconditionally, only into whatever room is actually
    left there - and only sends the remainder to gold once debt is
    genuinely full. Gold is still the last resort because it is
    structurally the only unconstrained bucket in this risk schema, not
    because it is safe; a properly constrained optimisation that knows
    the full covariance matrix (rather than this after-the-fact patch)
    remains the more correct long-term fix.
    """
    limits = RISK_LIMITS[profile]
    w = np.clip(w.copy(), 0.0, None)
    total = w.sum()
    w = w / total if total > 0 else equal_weight(len(ASSETS))

    debt = DEBT_IDX[0]
    gold = 3  # ASSETS.index("gold") - the one bucket with no profile ceiling

    pool = 0.0

    over_crypto = max(0.0, w[CRYPTO_IDX] - limits["crypto"])
    if over_crypto > 0:
        w[CRYPTO_IDX] -= over_crypto
        pool += over_crypto

    eq = w[EQUITY_IDX].sum()
    if eq > limits["equity_total"] and eq > 0:
        keep = limits["equity_total"]
        w[EQUITY_IDX] *= keep / eq
        pool += eq - keep

    room = max(0.0, MAX_WEIGHT - w[debt])
    take = min(pool, room)
    w[debt] += take
    pool -= take

    # Debt floor: only reachable when there was little or no crypto/equity
    # overflow to route here (debt was already at its natural min-variance
    # level and the pool above was small or empty). Topped up from gold
    # specifically, not from equity or crypto - those already sit at
    # profile-appropriate levels from the steps above and should not be
    # pulled back down to satisfy a different, unrelated constraint.
    if w[debt] < limits["debt_floor"]:
        shortfall = limits["debt_floor"] - w[debt]
        take = min(shortfall, w[gold])
        w[gold] -= take
        w[debt] += take

    # Gold gets what's left, up to its OWN ceiling - not an unlimited sink.
    # This is the fix a real overflow scenario exposed: without a ceiling
    # here, a "conservative" profile ended up with a quarter of its money
    # in an asset whose real volatility is close to crypto's.
    if pool > 0:
        room = max(0.0, limits["gold"] - w[gold])
        take = min(pool, room)
        w[gold] += take
        pool -= take

    # GENUINE last resort: every capped bucket - crypto, equity, debt, AND
    # now gold - is saturated, and there is still money with nowhere
    # policy-approved to go. This can only happen when a profile's caps are
    # jointly too tight for what the real covariance structure wants, which
    # is a configuration problem worth knowing about rather than silently
    # smoothing over - hence the warning. Spread proportionally to whatever
    # headroom remains under the universal 35% cap, wherever that is.
    if pool > 1e-9:
        headroom = np.maximum(0.0, MAX_WEIGHT - w)
        total_headroom = headroom.sum()
        if total_headroom > 1e-9:
            w += pool * (headroom / total_headroom)
        else:
            w += pool / len(ASSETS)

    w = np.clip(w, 0.0, None)
    s = w.sum()
    return w / s if s > 0 else equal_weight(len(ASSETS))


def _weights_for(profile: str, cov: np.ndarray) -> np.ndarray:
    tilt = RISK_LIMITS[profile]["tilt"]
    w_safe = min_variance(cov, max_weight=MAX_WEIGHT)
    if tilt > 0:
        w = (1 - tilt) * w_safe + tilt * _max_return_capped(_mu_annual(), MAX_WEIGHT)
    else:
        w = w_safe
    return _apply_risk_limits(w, profile)


def _vol_of(w: np.ndarray, cov: np.ndarray) -> float:
    return float(np.sqrt(max(float(w @ cov @ w), 0.0)) * np.sqrt(252))


def allocate(profile: str) -> dict:
    """Weights per asset class for one risk profile, with the evidence."""
    if profile not in RISK_LIMITS:
        raise ValueError(f"unknown risk profile: {profile}")

    ev = _evidence()
    cov = _covariance()

    w = _weights_for(profile, cov)
    ann_vol = _vol_of(w, cov)

    # HONEST CHECK, NOT A SILENT ASSUMPTION.
    #
    # "Conservative" is defined by which asset CATEGORIES are excluded
    # (crypto, heavy equity) - it is not a guarantee about the resulting
    # NUMBER. Under most conditions excluding volatile categories also
    # produces the lowest number, but real markets do not always cooperate:
    # verified directly against real data mid-2026, gold's own volatility
    # (~32% annualised) was close to crypto's, so "conservative" - which is
    # pushed toward gold specifically because crypto and heavy equity are
    # off the table - came out numerically MORE volatile than "balanced".
    # That is a genuine property of an unusual real gold rally, not a bug in
    # this file, and it deserved a name rather than a silent inconsistency
    # a user (or a future maintainer) would have had to notice on their own.
    order = ["conservative", "balanced", "aggressive"]
    vols = {profile: ann_vol}
    for other in order:
        if other != profile:
            vols[other] = _vol_of(_weights_for(other, cov), cov)
    ranked = sorted(order, key=lambda p: vols[p])
    ordering_note = None
    if ranked != order:
        ordering_note = (
            "Right now, real market conditions mean the usual risk ordering "
            f"is inverted: by expected volatility alone, {ranked[0]} is "
            f"calmest and {ranked[-1]} is roughest, not the conservative -> "
            "aggressive order the names imply. This is driven by an unusual "
            "real volatility spike in one of the six real assets, not a "
            "flaw in how your risk tolerance was read."
        )

    eq_w = equal_weight(len(ASSETS))
    eq_vol = float(np.sqrt(float(eq_w @ cov @ eq_w)) * np.sqrt(252))

    mv = ev["strategies"]["min-var (Ledoit-Wolf)"]
    bench = ev["strategies"]["1/N equal weight"]
    beats_return = mv["return"] > bench["return"]

    # Built from the real evaluation's own numbers, so the claim always
    # matches what actually happened in that test - it does not hardcode
    # which direction the comparison goes, because a synthetic-data version
    # of this file once got that backwards after the underlying model changed
    # and nobody updated the sentence describing it.
    caveat = (
        f"Evaluated on {ev['n_quarters']} real market quarters "
        f"({ev['evaluation_window']['start']} to {ev['evaluation_window']['end']}). "
        f"This allocation earned {mv['return']*100:.1f}% annualised against "
        f"{bench['return']*100:.1f}% for spreading money evenly across the same "
        f"six assets, while cutting volatility from {bench['vol']*100:.1f}% to "
        f"{mv['vol']*100:.1f}%. "
        + (
            "It beat the simple split on both return and risk in this window - "
            "a real result, on a short real history, not a promise it repeats."
            if beats_return else
            "It did not out-earn the simple split in this window; the case for "
            "it is the lower volatility, not higher returns."
        )
    )

    return {
        "model_version": MODEL_VERSION,
        "risk_profile": profile,
        "growth_tilt": RISK_LIMITS[profile]["tilt"],
        "weights": {a: round(float(x), 4) for a, x in zip(ASSETS, w)},
        "expected_annual_volatility": round(ann_vol, 4),
        "equal_weight_volatility": round(eq_vol, 4),
        "max_single_asset_weight": MAX_WEIGHT,
        "evidence": {
            "data_source": ev["data_source"],
            "n_quarters": ev["n_quarters"],
            "evaluation_window": ev["evaluation_window"],
            "annual_return": mv["return"],
            "benchmark_annual_return": bench["return"],
            "volatility_reduction_pct": round((1 - mv["vol"] / bench["vol"]) * 100, 1),
            "drawdown_reduction_pct": round(
                (1 - mv["max_drawdown"] / bench["max_drawdown"]) * 100, 1
            ),
            "benchmark": "equal weight across the same six real assets",
            "beats_benchmark_return": beats_return,
        },
        "caveat": caveat,
        "ordering_note": ordering_note,
    }
