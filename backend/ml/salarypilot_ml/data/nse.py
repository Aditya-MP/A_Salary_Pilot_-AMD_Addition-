"""
Real NSE-listed equity data — the universe and its price history.

Everything else in this app that touches a "share price" is a calibrated
simulator, and every screen that shows one says so. This module is the one
exception: it fetches genuinely real data, from two real, freely-accessible
sources, so that M8 (the momentum/quality screener) can be trained and
evaluated on markets that actually happened rather than a random walk.

TWO SOURCES, EACH FOR ONE THING
--------------------------------

1. THE UNIVERSE — NSE's own public archive.
   nsearchives.nseindia.com serves the current Nifty 500 constituent list as
   a CSV. This is the exchange's own regulatory disclosure, so there is no
   ambiguity about legitimacy: every name in it is a real, currently-listed
   company on a real Indian stock exchange. (NSE's main site blocks
   non-browser requests with a 403; the archives host does not - this was
   verified directly before writing a line of the pipeline.)

2. THE HISTORY — Yahoo Finance's chart endpoint.
   Unofficial and undocumented, but it is the standard free source for NSE
   price history (the ".NS" suffix), used by the widely-adopted `yfinance`
   library and countless research notebooks. It can be rate-limited or
   change without notice - which is exactly why everything here is cached
   to disk. A demo project has no business hitting a free API on every run.

WHAT THIS DOES NOT DO
----------------------
No fundamentals (earnings, debt, governance). Yahoo's chart endpoint gives
prices, not financial statements, and scraping financial statements at scale
is a different, much larger undertaking. That is precisely why M8 is a
PRICE-based factor model (momentum, volatility) rather than a claim to
understand any company's business - see models/factors.py for exactly what
is and is not being claimed.
"""

from __future__ import annotations

import csv
import io
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parents[2] / "data_cache" / "nse"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
NIFTY500_CSV = "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv"
CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"

# The real Nifty 500 index itself, for the baseline every backtest compares
# against. Confirmed against Yahoo directly: ^CRSLDX -> "NIFTY 500".
NIFTY500_INDEX = "^CRSLDX"


def _get(url: str, timeout: int = 15) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


@dataclass
class Constituent:
    name: str
    symbol: str
    industry: str
    isin: str


def fetch_universe(force: bool = False) -> list[Constituent]:
    """The current, real Nifty 500 constituent list, straight from NSE."""
    cache = CACHE_DIR / "nifty500_universe.json"
    if cache.exists() and not force:
        rows = json.loads(cache.read_text(encoding="utf-8"))
        return [Constituent(**r) for r in rows]

    raw = _get(NIFTY500_CSV).decode("utf-8-sig")
    out: list[Constituent] = []
    for row in csv.DictReader(io.StringIO(raw)):
        out.append(Constituent(
            name=row["Company Name"].strip(),
            symbol=row["Symbol"].strip(),
            industry=row["Industry"].strip(),
            isin=row["ISIN Code"].strip(),
        ))

    cache.write_text(
        json.dumps([c.__dict__ for c in out], ensure_ascii=False, indent=0),
        encoding="utf-8",
    )
    return out


@dataclass
class PriceSeries:
    ticker: str
    dates: list[str]     # ISO date strings, ascending
    close: list[float]
    volume: list[float]


def _parse_chart(payload: dict, ticker: str) -> PriceSeries | None:
    try:
        result = payload["chart"]["result"][0]
    except (KeyError, IndexError, TypeError):
        return None

    ts = result.get("timestamp")
    if not ts:
        return None
    quote = result["indicators"]["quote"][0]
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []

    dates, close, volume = [], [], []
    for i, t in enumerate(ts):
        c = closes[i] if i < len(closes) else None
        if c is None:
            continue  # a market holiday inside the range - skip, don't zero-fill
        dates.append(time.strftime("%Y-%m-%d", time.gmtime(t)))
        close.append(float(c))
        volume.append(float(volumes[i]) if i < len(volumes) and volumes[i] is not None else 0.0)

    if len(close) < 60:
        return None  # too little history to be useful for anything
    return PriceSeries(ticker=ticker, dates=dates, close=close, volume=volume)


def fetch_history(ticker: str, range_: str = "5y", force: bool = False) -> PriceSeries | None:
    """
    Daily OHLC-close history for one ticker (NSE names take the ".NS" suffix
    Yahoo expects; the index ticker is passed through unchanged).

    Cached to disk per ticker. Returns None on any failure - a single bad
    ticker (delisted, renamed, rate-limited) must not take down a run over
    500 of them.
    """
    safe = ticker.replace("^", "_INDEX_")
    cache = CACHE_DIR / f"{safe}.json"
    if cache.exists() and not force:
        d = json.loads(cache.read_text(encoding="utf-8"))
        return PriceSeries(**d)

    url = CHART_URL.format(ticker=ticker) + f"?range={range_}&interval=1d"
    try:
        payload = json.loads(_get(url))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    series = _parse_chart(payload, ticker)
    if series is None:
        return None

    cache.write_text(
        json.dumps(series.__dict__, ensure_ascii=False), encoding="utf-8"
    )
    return series


def fetch_universe_history(
    tickers: list[str],
    range_: str = "5y",
    delay_s: float = 0.25,
    progress_every: int = 25,
) -> dict[str, PriceSeries]:
    """
    Fetches (or loads from cache) daily history for many tickers.

    Sequential, with a delay between requests that were not already cached -
    hammering a free, unofficial endpoint with 500 concurrent requests is how
    it stops being free for the next person who needs it, and how this
    project gets its IP blocked mid-run. Already-cached tickers cost nothing,
    so a re-run after an interrupted one only fetches what is still missing.
    """
    out: dict[str, PriceSeries] = {}
    fetched_this_run = 0
    for i, t in enumerate(tickers):
        safe = t.replace("^", "_INDEX_")
        was_cached = (CACHE_DIR / f"{safe}.json").exists()

        s = fetch_history(t, range_=range_)
        if s is not None:
            out[t] = s
        if not was_cached:
            fetched_this_run += 1
            time.sleep(delay_s)

        if (i + 1) % progress_every == 0:
            print(f"  {i + 1}/{len(tickers)} processed, {len(out)} usable, "
                  f"{fetched_this_run} fetched fresh this run")

    return out


def yahoo_ticker(nse_symbol: str) -> str:
    return f"{nse_symbol}.NS"
