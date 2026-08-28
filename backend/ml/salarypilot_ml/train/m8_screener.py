"""
M8 - momentum/low-volatility screener over the real Nifty 500.

    python -m salarypilot_ml.train.m8_screener

DATA: REAL, NOT SIMULATED
---------------------------
Every other model in this project (M1-M7) is trained on a calibrated
synthetic generator, disclosed as such. M8 is the one exception: the
universe is the actual, current Nifty 500 constituent list from NSE, and
the prices are real closing prices from Yahoo Finance's NSE feed (see
data/nse.py for exactly how, and its honesty about being an unofficial
source). Run `python fetch_data.py` first to populate the cache this reads.

WHAT "SHIP" MEANS HERE
------------------------
The composite score (models/factors.py) is used to form a portfolio of the
top quintile of the real Nifty 500 by score, rebalanced quarterly, and
walked forward through the real history actually fetched. The baseline is
the real Nifty 500 index itself (^CRSLDX) over the same dates - not equal
weight, not a synthetic benchmark. If the tilt does not beat the real index
on a walk-forward basis, this prints that plainly and does not claim a ship,
exactly the discipline M2 and M3 were held to.

WHAT THE OUTPUT IS FOR
------------------------
A ranked list with a composite score and the evaluation's own historical hit
rate - "portfolios formed this way beat the index in N of M quarters" - never
a promise about any specific stock or period. This feeds a diversified
top-quintile BASKET (see engine/planEngine.ts's autoAllocate note for why
individual-stock recommendations are refused everywhere else in this app);
it is not a "buy these three" signal and the API will not present it as one.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from ..data.nse import CACHE_DIR, NIFTY500_INDEX, fetch_universe
from ..models.factors import score_universe

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)

QUARTER_DAYS = 63          # rebalance cadence
LOOKBACK_DAYS = 13 * 21    # enough for 12-1 momentum
TOP_QUINTILE = 0.20


def load_cached_series() -> dict[str, dict]:
    """Everything the fetcher already cached, keyed by ticker."""
    out = {}
    for f in CACHE_DIR.glob("*.json"):
        if f.name == "nifty500_universe.json":
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        out[d["ticker"]] = d
    return out


def align_by_date(series: dict[str, dict]) -> tuple[list[str], dict[str, np.ndarray]]:
    """
    Common trading-day calendar. Real markets have real holidays, and a
    ticker missing a handful of days (a trading halt, a late listing) is
    normal - this keeps the index dates as the reference calendar and skips
    any ticker whose dates do not line up cleanly enough to trust, rather
    than silently forward-filling gaps that never happened.
    """
    if NIFTY500_INDEX not in series:
        raise RuntimeError(
            "the Nifty 500 index itself was not fetched - run fetch_data.py first"
        )
    calendar = series[NIFTY500_INDEX]["dates"]
    idx_of = {d: i for i, d in enumerate(calendar)}

    aligned: dict[str, np.ndarray] = {}
    for ticker, d in series.items():
        if ticker == NIFTY500_INDEX:
            continue
        dates, closes = d["dates"], d["close"]
        # Require this ticker to cover at least 90% of the reference calendar
        # inside its own range - a partial listing history is expected and
        # fine; a ticker with huge unexplained gaps is not trustworthy input.
        date_set = set(dates)
        overlap = sum(1 for dt in calendar if dt in date_set)
        if overlap < 0.85 * len(calendar):
            continue

        arr = np.full(len(calendar), np.nan)
        for dt, c in zip(dates, closes):
            j = idx_of.get(dt)
            if j is not None:
                arr[j] = c
        aligned[ticker] = arr

    return calendar, aligned


def annualise(period_returns: np.ndarray, periods_per_year: float) -> tuple[float, float, float]:
    mu = float(period_returns.mean()) * periods_per_year
    sd = float(period_returns.std(ddof=1)) * np.sqrt(periods_per_year) if len(period_returns) > 1 else 0.0
    return mu, sd, (mu / sd if sd > 1e-12 else 0.0)


def max_drawdown(period_returns: np.ndarray) -> float:
    curve = np.cumprod(1 + period_returns)
    peak = np.maximum.accumulate(curve)
    return float(((curve - peak) / peak).min())


def run() -> dict:
    print("loading cached real price history...")
    raw = load_cached_series()
    universe = {c.symbol for c in fetch_universe()}
    print(f"  {len(raw)} series cached, {len(universe)} names in the real Nifty 500")

    calendar, aligned = align_by_date(raw)
    print(f"  {len(aligned)} tickers usable on a common {len(calendar)}-day calendar")

    idx_closes = np.array(raw[NIFTY500_INDEX]["close"])
    idx_dates = raw[NIFTY500_INDEX]["dates"]
    idx_of_date = {d: i for i, d in enumerate(idx_dates)}

    # Walk-forward rebalance points: every QUARTER_DAYS trading days, starting
    # once there is enough lookback for momentum, ending with enough runway
    # left to measure a forward quarter's return.
    starts = list(range(LOOKBACK_DAYS, len(calendar) - QUARTER_DAYS, QUARTER_DAYS))
    if len(starts) < 3:
        raise RuntimeError(
            f"only {len(starts)} rebalance periods available - fetch more history "
            "(range_='5y' or longer) before this evaluation means anything"
        )
    print(f"  {len(starts)} walk-forward quarters to evaluate\n")

    tilt_returns, index_returns, quarters = [], [], []
    picks_by_quarter: list[list[str]] = []

    for start in starts:
        # Momentum/vol computed ONLY from data up to `start` - the whole
        # point of walk-forward: nothing past the rebalance date is visible.
        window = {t: arr[max(0, start - LOOKBACK_DAYS):start]
                  for t, arr in aligned.items()}
        window = {t: a for t, a in window.items() if not np.isnan(a).any() and a[0] > 0}

        scores = score_universe(window)
        if len(scores) < 20:
            continue
        scores.sort(key=lambda s: s.composite, reverse=True)
        n_pick = max(1, int(len(scores) * TOP_QUINTILE))
        picks = scores[:n_pick]

        end = min(start + QUARTER_DAYS, len(calendar) - 1)
        rets = []
        for p in picks:
            arr = aligned[p.ticker]
            p0, p1 = arr[start], arr[end]
            if np.isnan(p0) or np.isnan(p1) or p0 <= 0:
                continue
            rets.append(p1 / p0 - 1)
        if not rets:
            continue

        tilt_q = float(np.mean(rets))  # equal-weight within the picked basket
        idx_q = float(idx_closes[end] / idx_closes[start] - 1)

        tilt_returns.append(tilt_q)
        index_returns.append(idx_q)
        quarters.append(calendar[start])
        picks_by_quarter.append([p.ticker for p in picks])

        print(f"  {calendar[start]}  tilt {tilt_q:+.2%}   index {idx_q:+.2%}   "
              f"{'tilt won' if tilt_q > idx_q else 'index won'}")

    tilt_arr = np.array(tilt_returns)
    idx_arr = np.array(index_returns)

    tilt_ann = annualise(tilt_arr, 4)
    idx_ann = annualise(idx_arr, 4)
    hit_rate = float((tilt_arr > idx_arr).mean())
    tilt_dd = max_drawdown(tilt_arr)
    idx_dd = max_drawdown(idx_arr)

    beat_baseline = tilt_ann[0] > idx_ann[0] and hit_rate >= 0.5

    print()
    print(f"  {'':20}{'return':>10}{'vol':>9}{'Sharpe':>9}{'max DD':>9}")
    print(f"  {'top-quintile tilt':<20}{tilt_ann[0]*100:>9.1f}%{tilt_ann[1]*100:>8.1f}%"
          f"{tilt_ann[2]:>9.2f}{tilt_dd*100:>8.1f}%")
    print(f"  {'Nifty 500 index':<20}{idx_ann[0]*100:>9.1f}%{idx_ann[1]*100:>8.1f}%"
          f"{idx_ann[2]:>9.2f}{idx_dd*100:>8.1f}%")
    print(f"\n  hit rate: tilt beat the index in {int(hit_rate*len(tilt_arr))}/{len(tilt_arr)} quarters ({hit_rate:.0%})")
    print(f"\n  VERDICT: {'ship - beats the real index on this walk-forward test' if beat_baseline else 'DO NOT SHIP - does not beat the real index'}")

    # CURRENT picks - scored on the full history up to today, not held back
    # for a forward test. This is what the API serves as "today's list"; it
    # is a DIFFERENT computation from the walk-forward evaluation above,
    # which must hold back a forward quarter to be a real test at all. The
    # evaluation says how this approach has performed historically; this is
    # what it says right now.
    name_by_symbol = {c.symbol: (c.name, c.industry) for c in fetch_universe()}
    today_window = {t: arr for t, arr in aligned.items() if not np.isnan(arr).any() and arr[0] > 0}
    current_scores = score_universe(today_window)
    current_scores.sort(key=lambda s: s.composite, reverse=True)
    n_current = max(1, int(len(current_scores) * TOP_QUINTILE))

    current_picks = []
    for s in current_scores[:n_current]:
        symbol = s.ticker.removesuffix(".NS")
        name, industry = name_by_symbol.get(symbol, (symbol, ""))
        current_picks.append({
            "ticker": symbol, "name": name, "industry": industry,
            "composite_score": round(s.composite, 4),
            "momentum_12m_ex_1m": round(s.momentum_12_1, 4),
            "annualised_volatility": round(s.volatility_ann, 4),
        })

    out = {
        "model": "m8_screener",
        "model_version": "m8-momentum-lowvol-v1",
        "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "as_of_date": calendar[-1],
        "data_source": "real Nifty 500 constituent list (NSE) + real daily closing prices (Yahoo Finance NSE feed)",
        "universe_size": len(aligned),
        "n_quarters": len(tilt_arr),
        "quarters": quarters,
        "top_quintile": {
            "annual_return": tilt_ann[0], "annual_vol": tilt_ann[1], "sharpe": tilt_ann[2],
            "max_drawdown": tilt_dd,
        },
        "nifty500_index": {
            "annual_return": idx_ann[0], "annual_vol": idx_ann[1], "sharpe": idx_ann[2],
            "max_drawdown": idx_dd,
        },
        "hit_rate": hit_rate,
        "quarterly_returns": {"tilt": tilt_returns, "index": index_returns},
        "picks_last_quarter": picks_by_quarter[-1] if picks_by_quarter else [],
        "current_picks": current_picks,
        "verdict": "ship" if beat_baseline else "do-not-ship",
        "caveat": (
            "A probability, not a promise: this basket beat the real Nifty 500 "
            f"index in {int(hit_rate*len(tilt_arr))} of {len(tilt_arr)} historical "
            "quarters on this walk-forward test. It has a known failure mode "
            "(momentum crashes sharply on some market reversals) and is based "
            "on price history only - nothing about any company's actual "
            "business. This ranks real, currently-listed companies; it is not "
            "a guarantee about any of them."
        ),
    }
    (ARTIFACTS / "m8_metrics.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    return out


if __name__ == "__main__":
    run()
