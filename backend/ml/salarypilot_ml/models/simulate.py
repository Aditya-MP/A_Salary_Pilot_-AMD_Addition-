"""
M6 - Monte Carlo freedom simulator.

Converts every headline number in the product from a point estimate into a
distribution. "Freedom at 54" becomes "median 54, tenth percentile 61", and
"6.4 months of runway" becomes "a 78% chance of surviving a six-month job
loss".

WHY THIS IS THE BIGGEST PRODUCT CHANGE
--------------------------------------
The current app computes a single confident number by compounding an average
return. That is not merely imprecise, it is systematically misleading: the
future it describes - steady returns, uninterrupted income, no surprises - is
the one future that will certainly not happen. A user planning against it is
planning against a fiction, and the fiction is always more optimistic than
reality because it has no downside paths in it.

A distribution is honest about what is actually known, and it lets the product
say the genuinely useful thing: not "you will be free at 54" but "on most
paths you are free between 52 and 61, and here is what moves that".

THE ONE METHODOLOGICAL DECISION THAT MATTERS
--------------------------------------------
Returns are resampled in BLOCKS, not independently.

An IID bootstrap draws each month at random, which destroys every bit of
temporal structure. Real returns have volatility clustering - bad months
arrive together - and that clustering is precisely what creates the ruinous
sequences: a crash early in retirement is far worse than the same crash late,
even with identical average returns. An IID bootstrap cannot generate that
scenario at all, so it systematically understates tail risk while looking
perfectly rigorous.

The stationary block bootstrap (Politis and Romano, 1994) resamples
variable-length blocks with geometric lengths, which preserves short-range
dependence while keeping the resampled series stationary. The comparison
between the two is measured directly in the training script rather than
asserted.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


# ── Resampling ──────────────────────────────────────────────────────────

def iid_bootstrap(
    data: np.ndarray, n_paths: int, n_steps: int, rng: np.random.Generator
) -> np.ndarray:
    """Independent resampling. Included to demonstrate what it destroys."""
    idx = rng.integers(0, len(data), size=(n_paths, n_steps))
    return data[idx]


def stationary_block_bootstrap(
    data: np.ndarray,
    n_paths: int,
    n_steps: int,
    mean_block: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """
    Politis-Romano stationary bootstrap.

    At each step, continue the current block with probability 1 - 1/L, or jump
    to a fresh random start with probability 1/L. Block lengths are therefore
    geometric with mean L, and the resampled series is stationary - which is
    the property that makes it valid to treat the paths as exchangeable draws.

    Indices wrap circularly so every observation has equal probability of
    being included, with no edge effects at the ends of the sample.

    Implemented as a vectorised index construction rather than a Python loop
    over paths: ten thousand paths of four hundred steps is four million
    lookups, which is a second in NumPy and a minute in a loop.
    """
    n = len(data)
    p_jump = 1.0 / max(mean_block, 1.0)

    idx = np.empty((n_paths, n_steps), dtype=np.int64)
    idx[:, 0] = rng.integers(0, n, size=n_paths)

    jumps = rng.random((n_paths, n_steps)) < p_jump
    fresh = rng.integers(0, n, size=(n_paths, n_steps))

    for t in range(1, n_steps):
        # Continue the block (advance by one, wrapping) or jump.
        cont = (idx[:, t - 1] + 1) % n
        idx[:, t] = np.where(jumps[:, t], fresh[:, t], cont)

    return data[idx]


# ── Scenario ────────────────────────────────────────────────────────────

@dataclass
class Scenario:
    """Everything the simulator needs, in monthly units and rupees."""
    net_worth: float
    liquid: float
    monthly_income: float
    essential_burn: float
    discretionary_burn: float
    monthly_invest: float

    age: int
    horizon_years: int = 40

    # Income risk. A salaried career is not a smooth line - roughly one
    # involuntary job loss per decade is a realistic base rate, and the gap
    # is what actually destroys plans.
    job_loss_annual_prob: float = 0.10
    unemployment_months_mean: float = 4.0
    real_salary_growth: float = 0.02

    # EVERYTHING IN THIS MODEL IS IN REAL (today's-rupee) TERMS.
    #
    # An earlier version inflated the expense base at 5.5% while treating the
    # return series as real, which deflates twice: the FI target grew while
    # the portfolio did not. That turned a ~9% nominal / ~3.5% real assumption
    # into an effective 3.9% real return against an inflating target, and made
    # the plan look impossible for what was an accounting error rather than a
    # fact about the user.
    #
    # Inflation now enters only as UNCERTAINTY - real spending drifts a little
    # because real prices do - not as a systematic drag applied on one side of
    # the ledger.
    inflation_sd: float = 0.010

    # Lumpy shocks: medical, family, a car. Rare, large, and absent from every
    # deterministic projection.
    shock_annual_prob: float = 0.15
    shock_months_of_burn: float = 2.5


@dataclass
class FreedomResult:
    fi_age: np.ndarray            # per path, np.inf if never reached
    terminal_wealth: np.ndarray
    runway_months: np.ndarray
    survived_job_loss: np.ndarray  # bool per path
    ruin: np.ndarray               # bool per path, liquid hit zero

    def pct(self, arr: np.ndarray, q: float) -> float:
        """
        Percentile over ALL paths, including the ones that never get there.

        An earlier version filtered to finite values first, which reported the
        median AMONG PATHS THAT SUCCEEDED. With 87% of paths never reaching
        FI, that produced a confident "median age 62" when the true median
        outcome was "never" - survivorship bias in the single headline number,
        which is precisely the bias this whole model exists to remove.

        np.inf sorts to the top, so if more than q% of paths fail, the
        percentile correctly comes back infinite and the caller has to say
        "never" out loud.
        """
        return float(np.percentile(arr, q))

    def pct_or_never(self, arr: np.ndarray, q: float) -> str:
        v = self.pct(arr, q)
        return "never" if not np.isfinite(v) else f"{v:.1f}"

    def prob_fi_by(self, age: float) -> float:
        return float(np.mean(self.fi_age <= age))


def simulate_paths(
    sc: Scenario,
    returns: np.ndarray,
    n_paths: int = 10_000,
    mean_block: int = 6,
    seed: int = 0,
    block: bool = True,
) -> FreedomResult:
    """
    Run the full scenario forward.

    `returns` are historical MONTHLY portfolio returns to resample from.

    Vectorised across paths: every array below is (n_paths,) and the loop runs
    over months only. Ten thousand paths over forty years is a few hundred
    thousand vector operations rather than a hundred million scalar ones.
    """
    rng = np.random.default_rng(seed)
    n_steps = sc.horizon_years * 12

    draw = stationary_block_bootstrap if block else (
        lambda d, p, s, mb, r: iid_bootstrap(d, p, s, r)
    )
    path_returns = (
        stationary_block_bootstrap(returns, n_paths, n_steps, mean_block, rng)
        if block else iid_bootstrap(returns, n_paths, n_steps, rng)
    )

    wealth = np.full(n_paths, sc.net_worth, dtype=np.float64)
    liquid = np.full(n_paths, sc.liquid, dtype=np.float64)
    income = np.full(n_paths, sc.monthly_income, dtype=np.float64)
    essential = np.full(n_paths, sc.essential_burn, dtype=np.float64)

    unemployed = np.zeros(n_paths, dtype=np.int32)
    fi_month = np.full(n_paths, np.inf)
    ruin = np.zeros(n_paths, dtype=bool)

    p_job_loss_month = 1 - (1 - sc.job_loss_annual_prob) ** (1 / 12)
    p_shock_month = 1 - (1 - sc.shock_annual_prob) ** (1 / 12)

    for t in range(n_steps):
        # ── real spending drift: mean zero, so it adds uncertainty and not
        #    a systematic trend ──
        infl_m = rng.normal(0.0, sc.inflation_sd, n_paths) / 12
        essential *= 1 + infl_m

        # ── job loss ──
        newly_lost = (rng.random(n_paths) < p_job_loss_month) & (unemployed == 0)
        duration = rng.geometric(1 / sc.unemployment_months_mean, n_paths)
        unemployed = np.where(newly_lost, duration, np.maximum(unemployed - 1, 0))
        working = unemployed == 0

        # Real salary growth, and only while employed.
        income = np.where(
            working, income * (1 + sc.real_salary_growth / 12), income
        )

        # ── lumpy shocks ──
        shock = (rng.random(n_paths) < p_shock_month) * (
            essential * sc.shock_months_of_burn
        )

        # ── cash flow ──
        inflow = np.where(working, income, 0.0)
        outflow = essential + sc.discretionary_burn * working + shock
        net = inflow - outflow

        liquid += net
        # A shortfall is funded from the portfolio; ruin is when nothing is
        # left to sell. That is the event the product should actually warn
        # about, and a deterministic projection can never produce it.
        short = np.minimum(liquid, 0.0)
        liquid -= short
        wealth += short

        invest = np.where(working & (net > 0), np.minimum(sc.monthly_invest, net), 0.0)
        liquid -= invest
        wealth += invest

        wealth *= 1 + path_returns[:, t]
        ruin |= wealth <= 0
        wealth = np.maximum(wealth, 0.0)

        # ── FI test: 25x annual essential spend, the 4% rule ──
        reached = (wealth >= essential * 12 * 25) & np.isinf(fi_month)
        fi_month = np.where(reached, t, fi_month)

    fi_age = sc.age + fi_month / 12
    runway = liquid / np.maximum(essential, 1e-9)

    return FreedomResult(
        fi_age=fi_age,
        terminal_wealth=wealth,
        runway_months=runway,
        survived_job_loss=~ruin,
        ruin=ruin,
    )


# ── Diagnostics for the resampling itself ───────────────────────────────

def acf1(x: np.ndarray) -> float:
    """Lag-1 autocorrelation."""
    x = x - x.mean()
    denom = float(np.sum(x * x))
    return float(np.sum(x[:-1] * x[1:]) / denom) if denom > 0 else 0.0


def volatility_clustering(x: np.ndarray) -> float:
    """
    Lag-1 autocorrelation of SQUARED returns.

    This is the number that separates the two bootstraps. Raw returns are
    close to uncorrelated in real markets, so preserving their ACF proves
    little; squared returns are strongly autocorrelated, and that is
    volatility clustering. An IID bootstrap drives this to zero and with it
    every sequence-of-returns scenario worth worrying about.
    """
    return acf1(x**2)
