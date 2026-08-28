# SalaryPilot ML service — real market data baked in at BUILD time.
#
# NOT BUILD-TESTED LOCALLY
# ---------------------------
# This machine's Docker daemon cannot start (virtualisation is disabled in
# firmware — the same reason this project moved off Docker/TimescaleDB to
# Neon early on). Written carefully and matched against known-good patterns,
# but the first real build of this file should happen on the hosting
# platform, and its output should be checked rather than assumed correct.
#
# WHY THE FETCH AND TRAINING STEPS RUN DURING THE BUILD, NOT AT REQUEST TIME
# ------------------------------------------------------------------------------
# M5 (portfolio allocator) and M8 (Nifty 500 screener) are evaluated on REAL
# data — a real Nifty 500 constituent list from NSE, real daily prices from
# Yahoo Finance (see salarypilot_ml/data/nse.py and market_factors.py). The
# served model must be evaluated on the SAME data it's serving from, or the
# `evidence`/`caveat` fields returned to users describe a different model
# than the one actually running — a real bug this project already found and
# fixed once this session for M5.
#
# So: fetch + evaluate happen once, IN THE BUILD, and the resulting
# artifacts (data_cache/, artifacts/m5_metrics.json, artifacts/m8_metrics.json)
# are baked into the image. The running container never needs outbound
# network access to NSE or Yahoo Finance at all, and does not depend on the
# platform's disk surviving a redeploy (free-tier disks generally do not).
# A redeploy naturally refreshes the real data, since the build re-fetches
# it — there is no separate "update the market data" step to remember.
#
# THE REAL, UNVERIFIED RISK
# -----------------------------
# This assumes the BUILD environment (not necessarily the same network path
# as the running container) can reach nsearchives.nseindia.com and Yahoo
# Finance. Verified reachable from this developer's machine; NOT verified
# from whatever cloud IP range the hosting platform's build runs on. If the
# fetch step fails during the platform's build, that is the first thing to
# investigate — see the fallback note at the bottom of this file.

FROM python:3.13-slim AS build

WORKDIR /app

# Dependencies first, cached separately from source so an edit to a .py
# file does not force a full pip reinstall.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Real data, fetched once, here. ~500 tickers, rate-limited — this is the
# slow part of the build (minutes, not seconds), by design: see nse.py for
# why it is deliberately not fast against a free, unofficial data source.
RUN python fetch_data.py

# Evaluates M5 and M8 against the data just fetched, writing
# artifacts/m5_metrics.json and artifacts/m8_metrics.json - the numbers
# service/allocate.py and service/screener.py serve to real requests.
RUN python -m salarypilot_ml.train.m5_portfolio
RUN python -m salarypilot_ml.train.m8_screener

FROM python:3.13-slim
WORKDIR /app

# Only the installed packages and the app + its now-real data move into the
# final image - not pip's build cache, not any stray files pytest/etc. left
# in the build stage.
COPY --from=build /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY --from=build /app /app

EXPOSE 8000

# --host 0.0.0.0: uvicorn's default (127.0.0.1) only accepts connections
# from inside the container itself - the platform's health checks and
# routed traffic arrive from outside it and would see nothing listening.
# $PORT falls back to 8000 for parity with local dev (see package.json's
# dev:all), but Render's injected PORT wins whenever it's set.
CMD uvicorn service.app:app --host 0.0.0.0 --port ${PORT:-8000}

# IF THE BUILD-TIME FETCH FAILS ON THE HOSTING PLATFORM
# ----------------------------------------------------------
# Fall back to fetching once from a machine that can reach NSE/Yahoo (this
# one), committing the resulting backend/ml/data_cache/ and
# backend/ml/artifacts/m*_metrics.json to a dedicated branch, and having
# this Dockerfile COPY them in directly instead of running the RUN steps
# above. Loses the "every redeploy refreshes the data" property; keeps
# everything else working. Not implemented here because the direct fetch
# is the better outcome if it works, and it should be given a real chance
# to work first.
