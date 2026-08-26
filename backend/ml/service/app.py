"""
SalaryPilot ML service.

    uvicorn service.app:app --port 8000

Serves the models the Go API calls. Two endpoints matter today:

    POST /v1/categorise   M1-v2  narration -> spending category + confidence
    POST /v1/simulate     M6     profile   -> distribution of outcomes

Design decisions worth stating:

* Every response carries `model_version`. An answer without the version that
  produced it cannot be debugged six months later, and drift becomes
  invisible.

* Confidence is returned and is calibrated (temperature-scaled). The UI shows
  it, so a number that lies is worse than no number.

* The simulator returns percentiles and probabilities, never a single number.
  The whole point of M6 is that the point estimate was the problem.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from datetime import date

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from salarypilot_ml.models.garch import simulate as garch_simulate
from salarypilot_ml.models.simulate import Scenario, simulate_paths
from service.registry import get_categoriser

START = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Train (or load) at boot rather than on first request, so the first user
    # does not pay for it and readiness genuinely means ready.
    get_categoriser()
    yield


app = FastAPI(
    title="SalaryPilot ML",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
)


# ── health ──────────────────────────────────────────────────────────────

@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "uptime_s": round(time.time() - START, 1)}


@app.get("/readyz")
def readyz() -> dict:
    c = get_categoriser()
    if c.clf is None:
        raise HTTPException(503, "model not loaded")
    return {
        "status": "ready",
        "models": {
            "m1v2_categoriser": {
                "version": c.version,
                "trained_at": c.trained_at,
                "train_seconds": c.train_seconds,
                "metrics": c.metrics,
            }
        },
    }


# ── M1: categorise ──────────────────────────────────────────────────────

class Txn(BaseModel):
    narration: str = Field(..., min_length=1, max_length=512)
    amount: float = Field(..., ge=0)
    channel: str = "upi"
    direction: str = "debit"
    day: date | None = None


class CategoriseRequest(BaseModel):
    transactions: list[Txn] = Field(..., min_length=1, max_length=500)


@app.post("/v1/categorise")
def categorise(req: CategoriseRequest) -> dict:
    """Classify a batch of transactions."""
    c = get_categoriser()
    t0 = time.time()

    results = [
        c.predict(t.narration, t.amount, t.channel, t.direction, t.day or date.today())
        for t in req.transactions
    ]

    return {
        "results": results,
        "model_version": c.version,
        "latency_ms": round((time.time() - t0) * 1000, 2),
        # Surfaced on every response, not buried in docs. Cold-start
        # performance is materially worse than the headline and the caller
        # should be able to see that without reading a README.
        "caveat": (
            f"macro-F1 {c.metrics['seen_macro_f1']:.3f} on known merchants, "
            f"{c.metrics['unseen_macro_f1']:.3f} on merchants never seen in training"
        ),
    }


# ── M6: simulate ────────────────────────────────────────────────────────

class SimulateRequest(BaseModel):
    net_worth: float
    liquid: float
    monthly_income: float
    essential_burn: float
    discretionary_burn: float
    monthly_invest: float
    age: int = Field(..., ge=16, le=90)
    horizon_years: int = Field(40, ge=5, le=60)
    real_return: float = Field(0.055, ge=0.0, le=0.20)
    n_paths: int = Field(5000, ge=500, le=20_000)


@app.post("/v1/simulate")
def simulate(req: SimulateRequest) -> dict:
    """
    Monte Carlo the user's financial future.

    Returns a distribution. There is deliberately no single headline number in
    this response - the caller has to decide how to present a range, which is
    the correct pressure to apply.
    """
    t0 = time.time()

    # Monthly returns with realistic volatility clustering, recentred on the
    # requested real return so the caller controls the one assumption that
    # dominates every output.
    daily = garch_simulate(360 * 21, omega=3e-6, alpha=0.09, beta=0.88, nu=6.0, seed=7)
    monthly = daily[: 360 * 21].reshape(360, 21).sum(axis=1)
    monthly = monthly - monthly.mean() + ((1 + req.real_return) ** (1 / 12) - 1)

    sc = Scenario(
        net_worth=req.net_worth,
        liquid=req.liquid,
        monthly_income=req.monthly_income,
        essential_burn=req.essential_burn,
        discretionary_burn=req.discretionary_burn,
        monthly_invest=req.monthly_invest,
        age=req.age,
        horizon_years=req.horizon_years,
    )

    res = simulate_paths(sc, monthly, n_paths=req.n_paths, seed=7, block=True)
    reached = bool_mean = float(np.isfinite(res.fi_age).mean())

    def pct(q: float) -> float | None:
        v = float(np.percentile(res.fi_age, q))
        return v if np.isfinite(v) else None

    return {
        "freedom_age": {
            "p10": pct(10), "p25": pct(25), "p50": pct(50),
            "p75": pct(75), "p90": pct(90),
        },
        "probability_reaching_fi": reached,
        "probability_by_age": {
            str(a): res.prob_fi_by(a) for a in (45, 50, 55, 60, 65, 70)
        },
        "probability_never_running_out": float(res.survived_job_loss.mean()),
        "assumptions": {
            "real_return": req.real_return,
            "job_loss_annual_prob": sc.job_loss_annual_prob,
            "shock_annual_prob": sc.shock_annual_prob,
            "note": (
                "All figures in real (today's-rupee) terms. A null percentile "
                "means more than that share of paths never reach financial "
                "independence within the horizon - 'never' is a real outcome, "
                "not missing data."
            ),
        },
        "n_paths": req.n_paths,
        "model_version": "m6_block_bootstrap_v1",
        "latency_ms": round((time.time() - t0) * 1000, 2),
    }
