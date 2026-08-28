"""
Real return series for M5's six asset-class buckets.

WHY THIS FILE EXISTS
---------------------
M5's covariance estimate used to come from a calibrated SYNTHETIC one-factor
simulator with a hardcoded seed. That made it wrong in a specific, easy to
miss way: every call to `/v1/allocate`, for every user, on every day, produced
the exact same numbers - not because the underlying risk relationships were
stable (they do move slowly, correlations shift, volatility regimes change),
but because nothing about the computation could ever change. A user checking
their allocation in January and again in June would get byte-identical
weights, which is indistinguishable from the feature being broken.

Fixed the same way M8 was built: real instruments, real prices, no seed.

THE SIX PROXIES, EACH VERIFIED REACHABLE BEFORE BEING WIRED IN
------------------------------------------------------------------
    equity_large   ^NSEI            Nifty 50 index
    equity_flexi   ^CRSLDX          Nifty 500 index (broader than large-cap)
    debt           GILT5YBEES.NS    Nippon India ETF Nifty 5yr G-Sec
    gold           GOLDBEES.NS      Nippon India ETF Gold BeES
    esg            ESG.NS           Mirae Asset ESG Sector Leaders ETF
    crypto         BTC-USD          Bitcoin, in USD

All real, all fetched through the same Yahoo Finance chart endpoint M8 uses,
all cached to disk so this does not hit the network on every training run or
every server boot.

THE ONE HONEST LIMITATION
----------------------------
ESG.NS only has real trading history back to 2023-08-29 - Indian ESG ETFs are
young. That caps how far back a common calendar across all six can go, which
in turn caps how many independent walk-forward quarters the evaluation in
train/m5_portfolio.py can test. Reported plainly there, not smoothed over.
"""

from __future__ import annotations

import numpy as np

from .nse import PriceSeries, fetch_history

ASSETS = ["equity_large", "equity_flexi", "debt", "gold", "esg", "crypto"]

TICKERS: dict[str, str] = {
    "equity_large": "^NSEI",
    "equity_flexi": "^CRSLDX",
    "debt": "GILT5YBEES.NS",
    "gold": "GOLDBEES.NS",
    "esg": "ESG.NS",
    "crypto": "BTC-USD",
}


def fetch_all(range_: str = "5y") -> dict[str, PriceSeries]:
    out: dict[str, PriceSeries] = {}
    for bucket, ticker in TICKERS.items():
        s = fetch_history(ticker, range_=range_)
        if s is None:
            raise RuntimeError(f"could not fetch real data for {bucket} ({ticker})")
        out[bucket] = s
    return out


def aligned_returns(range_: str = "5y") -> tuple[list[str], np.ndarray]:
    """
    Daily simple returns for all six buckets, aligned on their common trading
    calendar (intersection of dates - currently bounded by ESG.NS's shorter
    real history). Columns are ordered as ASSETS.

    Returns (dates, returns) where returns has shape (n_days - 1, 6).
    """
    series = fetch_all(range_)

    common = set(series[ASSETS[0]].dates)
    for a in ASSETS[1:]:
        common &= set(series[a].dates)
    dates = sorted(common)
    if len(dates) < 300:
        raise RuntimeError(
            f"only {len(dates)} common trading days across all six real series - "
            "too little overlap for a trustworthy covariance estimate"
        )

    price_by_date: dict[str, dict[str, float]] = {}
    for a in ASSETS:
        idx = {d: c for d, c in zip(series[a].dates, series[a].close)}
        price_by_date[a] = idx

    prices = np.array([[price_by_date[a][d] for a in ASSETS] for d in dates])
    rets = prices[1:] / prices[:-1] - 1.0
    return dates[1:], rets
