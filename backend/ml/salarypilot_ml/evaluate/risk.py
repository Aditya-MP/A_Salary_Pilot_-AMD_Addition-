"""
Value-at-Risk, Expected Shortfall, and the tests that decide whether a risk
model can be believed.

THE POINT OF BACKTESTING VaR
----------------------------
A 95% one-day VaR is a falsifiable claim: losses should exceed it on about 5%
of days. So unlike most model outputs, this one can be checked directly, and
the check is a hypothesis test rather than an opinion.

Two things have to hold, and they are genuinely separate:

  COVERAGE      the exceedance rate matches the promised level (Kupiec)
  INDEPENDENCE  exceedances do not cluster (Christoffersen)

The second matters more than it looks. A model can produce exactly 5%
exceedances and still be useless if all of them land in the same fortnight -
that is precisely the model failing when risk is high, which is the only time
anyone consults it. Volatility clustering is what makes this the normal
failure mode of a constant-volatility model, and it is why GARCH exists.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


def var_parametric(sigma: float, alpha: float = 0.05, nu: float | None = None) -> float:
    """
    One-day VaR as a positive loss number.

    Student-t when nu is supplied, scaled to unit variance so the quantile is
    comparable with the Gaussian one.
    """
    if nu is None:
        z = stats.norm.ppf(alpha)
    else:
        z = stats.t.ppf(alpha, nu) * math.sqrt((nu - 2) / nu)
    return float(-z * sigma)


def var_historical(returns: np.ndarray, alpha: float = 0.05) -> float:
    """Empirical quantile. Assumes nothing, adapts to nothing."""
    return float(-np.quantile(returns, alpha))


def var_filtered_historical(
    standardised: np.ndarray, sigma_next: float, alpha: float = 0.05
) -> float:
    """
    Filtered historical simulation - the method that actually works.

    Take the empirical quantile of the GARCH-standardised residuals, then
    rescale by tomorrow's forecast volatility. It keeps the fat tails and skew
    of the real return distribution, which a Gaussian throws away, while still
    reacting to the current volatility state, which plain historical
    simulation cannot.
    """
    q = float(np.quantile(standardised, alpha))
    return float(-q * sigma_next)


def expected_shortfall(returns: np.ndarray, alpha: float = 0.05) -> float:
    """
    Mean loss given the loss exceeds VaR.

    Preferred over VaR in the Basel framework, for a good reason: VaR says how
    far the cliff edge is and nothing about the drop. ES is also coherent -
    it respects diversification, which VaR provably does not.
    """
    cut = np.quantile(returns, alpha)
    tail = returns[returns <= cut]
    return float(-tail.mean()) if len(tail) else float(-cut)


# ── Backtests ───────────────────────────────────────────────────────────

def kupiec_pof(exceedances: int, n: int, alpha: float = 0.05) -> dict:
    """
    Kupiec proportion-of-failures test.

    H0: the true exceedance probability equals alpha. The statistic is a
    likelihood ratio, asymptotically chi-squared with one degree of freedom,
    so 3.841 is the 5% critical value.
    """
    x, p = exceedances, alpha
    if n == 0:
        return {"lr": float("nan"), "p_value": float("nan"), "pass": False,
                "rate": float("nan"), "expected": p}

    rate = x / n
    if x == 0:
        lr = -2 * (n * math.log(1 - p))
    elif x == n:
        lr = -2 * (n * math.log(p))
    else:
        ll_null = (n - x) * math.log(1 - p) + x * math.log(p)
        ll_alt = (n - x) * math.log(1 - rate) + x * math.log(rate)
        lr = -2 * (ll_null - ll_alt)

    p_value = float(1 - stats.chi2.cdf(lr, df=1))
    return {"lr": float(lr), "p_value": p_value, "pass": p_value > 0.05,
            "rate": rate, "expected": p, "exceedances": x, "n": n}


def christoffersen_independence(hits: np.ndarray) -> dict:
    """
    Christoffersen test for clustering of exceedances.

    H0: an exceedance today is independent of one yesterday. Built from the
    transition counts of the hit sequence; also chi-squared with one degree of
    freedom.

    Failing this while passing Kupiec is the classic signature of a
    constant-volatility model: the right number of breaches overall, all
    bunched into the turbulent weeks.
    """
    hits = np.asarray(hits).astype(int)
    if len(hits) < 2:
        return {"lr": float("nan"), "p_value": float("nan"), "pass": False}

    n00 = n01 = n10 = n11 = 0
    for a, b in zip(hits[:-1], hits[1:]):
        if a == 0 and b == 0:
            n00 += 1
        elif a == 0 and b == 1:
            n01 += 1
        elif a == 1 and b == 0:
            n10 += 1
        else:
            n11 += 1

    if (n01 + n11) == 0 or (n00 + n01) == 0 or (n10 + n11) == 0:
        return {"lr": 0.0, "p_value": 1.0, "pass": True, "note": "too few exceedances"}

    pi = (n01 + n11) / (n00 + n01 + n10 + n11)
    pi0 = n01 / (n00 + n01)
    pi1 = n11 / (n10 + n11)

    def safe_log(x: float) -> float:
        return math.log(x) if x > 0 else 0.0

    ll_null = (n00 + n10) * safe_log(1 - pi) + (n01 + n11) * safe_log(pi)
    ll_alt = (
        n00 * safe_log(1 - pi0) + n01 * safe_log(pi0)
        + n10 * safe_log(1 - pi1) + n11 * safe_log(pi1)
    )
    lr = -2 * (ll_null - ll_alt)
    p_value = float(1 - stats.chi2.cdf(lr, df=1))

    return {"lr": float(lr), "p_value": p_value, "pass": p_value > 0.05,
            "p_hit_after_hit": pi1, "p_hit_after_calm": pi0}


def backtest_var(returns: np.ndarray, var_series: np.ndarray, alpha: float = 0.05) -> dict:
    """Run both tests over an out-of-sample VaR path."""
    hits = (returns < -var_series).astype(int)
    kupiec = kupiec_pof(int(hits.sum()), len(hits), alpha)
    indep = christoffersen_independence(hits)
    return {
        "kupiec": kupiec,
        "independence": indep,
        # Both must hold. Getting the count right while the breaches cluster
        # is the failure that matters.
        "pass": bool(kupiec["pass"] and indep["pass"]),
        "hit_rate": float(hits.mean()),
        "exceedances": int(hits.sum()),
        "n": int(len(hits)),
    }
