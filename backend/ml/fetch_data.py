"""One-off driver: pull the real Nifty 500 universe + 5y daily history + the
real Nifty 500 index itself, all cached to disk under data_cache/nse/.

    python fetch_data.py
"""
from salarypilot_ml.data.nse import fetch_universe, fetch_universe_history, yahoo_ticker, NIFTY500_INDEX

print("fetching the real Nifty 500 constituent list from NSE...")
universe = fetch_universe()
print(f"  {len(universe)} companies")

tickers = [yahoo_ticker(c.symbol) for c in universe]

print(f"\nfetching 5y daily history for {len(tickers)} tickers + the index (cached, resumable)...")
hist = fetch_universe_history(tickers + [NIFTY500_INDEX], range_="5y", delay_s=0.2)
print(f"\ndone: {len(hist)}/{len(tickers) + 1} series usable")
