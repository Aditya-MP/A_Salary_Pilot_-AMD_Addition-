"""
M8 - a price-based factor score. Momentum and low-volatility, combined.

WHAT THIS CLAIMS, PRECISELY
----------------------------
That stocks with strong recent price trends and comparatively calm price
behaviour have, across decades of published research and multiple markets,
outperformed the broad index MORE OFTEN than chance - not always, not by a
guaranteed amount, and with a well-documented failure mode (see below). This
is a PROBABILITY claim, in the same house style as M1's confidence scores
and M6's percentile outcomes: never "this will happen," always "this has
tended to happen, X% of the time, under conditions we can name."

WHAT THIS DOES NOT CLAIM
--------------------------
Nothing about any company's business. No earnings, no debt, no product, no
management quality. This is price and volume only - the entire input is
what changed hands and at what price, nothing about why. A user asking
"is this a good company" is asking a question this model cannot answer and
does not pretend to.

TWO FACTORS, BOTH FROM THE PUBLISHED LITERATURE
-------------------------------------------------

MOMENTUM (12-1): the past twelve months' return, EXCLUDING the most recent
month. Jegadeesh & Titman (1993) is the original documentation; the effect
has since been replicated across decades and dozens of national markets,
which is a rare thing in finance research. The one-month exclusion is
standard practice - the most recent month is dominated by short-term
reversal (a different, opposing effect), and including it weakens the
signal rather than strengthening it.

    THE KNOWN FAILURE MODE: momentum crashes. When a market turns sharply
    after a sustained decline (2009 is the canonical example), yesterday's
    momentum losers rebound hardest and momentum portfolios can lose
    heavily in a short window. Any serious use of this factor sizes for
    that, and the evaluation in train/m8_screener.py reports max drawdown
    for exactly this reason - a factor with a real, publishable long-run
    edge and an occasional bad month is not a contradiction, it is the
    normal shape of a risk premium.

LOW VOLATILITY: trailing daily return volatility (annualised) over the same
lookback. The "low-volatility anomaly" (Ang, Hodrick, Xing & Zhang 2006 and
much subsequent work) is the empirical finding that lower-volatility stocks
have historically NOT been correspondingly lower-return, in violation of the
textbook risk-return relationship - i.e. exposure to it has often been
close to free.

Combined as a simple average z-score. Not because a fancier weighting was
tried and this won - because there is no basis here for claiming to know the
optimal weighting, and pretending otherwise would be the same overclaiming
this file exists to avoid.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class FactorScore:
    ticker: str
    momentum_12_1: float      # trailing 12m return, most recent month excluded
    volatility_ann: float     # annualised daily-return volatility, trailing window
    momentum_z: float
    low_vol_z: float
    composite: float          # (momentum_z - low_vol_z) / 2 - higher is "more favoured"


def daily_returns(close: np.ndarray) -> np.ndarray:
    return close[1:] / close[:-1] - 1.0


def momentum_12_1(close: np.ndarray, trading_days_per_month: int = 21) -> float | None:
    """
    Return over months t-12 to t-1, skipping the most recent month.

    Needs at least 13 months of history; returns None otherwise rather than
    computing a number on too little data and presenting it with the same
    confidence as a properly-formed one.
    """
    m = trading_days_per_month
    if len(close) < 13 * m:
        return None
    end = close[-m]           # price one month ago
    start = close[-13 * m]    # price thirteen months ago
    if start <= 0:
        return None
    return float(end / start - 1.0)


def trailing_volatility(close: np.ndarray, window_days: int = 126) -> float | None:
    """Annualised volatility of daily returns over the trailing window."""
    if len(close) < window_days + 1:
        return None
    rets = daily_returns(close[-(window_days + 1):])
    if len(rets) < 2:
        return None
    return float(np.std(rets, ddof=1) * np.sqrt(252))


def zscore(values: np.ndarray) -> np.ndarray:
    mu, sd = values.mean(), values.std(ddof=1)
    if sd < 1e-12:
        return np.zeros_like(values)
    return (values - mu) / sd


def score_universe(
    closes: dict[str, np.ndarray],
    trading_days_per_month: int = 21,
    vol_window: int = 126,
) -> list[FactorScore]:
    """
    Scores every ticker with enough history, cross-sectionally z-scored
    against the others actually scored (not a fixed universe-wide constant -
    the peer group a stock is compared to is whichever peers also had
    enough history on this date, which is what a walk-forward evaluation
    needs: the score at each point must only use what was knowable then).
    """
    mom, vol, tickers = [], [], []
    for ticker, close in closes.items():
        m = momentum_12_1(close, trading_days_per_month)
        v = trailing_volatility(close, vol_window)
        if m is None or v is None:
            continue
        tickers.append(ticker)
        mom.append(m)
        vol.append(v)

    if len(tickers) < 10:
        return []  # too small a peer group for a z-score to mean anything

    mom_z = zscore(np.array(mom))
    vol_z = zscore(np.array(vol))

    out = []
    for i, t in enumerate(tickers):
        # Favour high momentum, low volatility - hence the minus sign on vol.
        composite = float((mom_z[i] - vol_z[i]) / 2)
        out.append(FactorScore(
            ticker=t, momentum_12_1=mom[i], volatility_ann=vol[i],
            momentum_z=float(mom_z[i]), low_vol_z=float(vol_z[i]),
            composite=composite,
        ))
    return out
