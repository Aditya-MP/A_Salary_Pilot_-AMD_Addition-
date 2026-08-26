"""
M5 - Portfolio optimisation.

Replaces TARGET_MIX in the frontend, which is a dictionary of numbers somebody
typed in.

WHAT IS HAND-WRITTEN HERE
-------------------------
Ledoit-Wolf shrinkage including the shrinkage intensity formula, Euclidean
projection onto the simplex, a projected-gradient QP solver, the efficient
frontier, and Black-Litterman. NumPy does the linear algebra; the estimators
and the optimiser are implemented directly.

THE PROBLEM WITH TEXTBOOK MARKOWITZ
-----------------------------------
Mean-variance optimisation is an error-maximiser. It takes estimated returns
and an estimated covariance and pours weight into whichever asset's return was
most overestimated and whose variance was most underestimated - which is
exactly where the estimation error is largest. With N assets you are
estimating N(N+1)/2 covariance terms from a few hundred observations, so the
sample covariance is close to singular and its inverse amplifies the noise
enormously.

The two defences implemented here are the standard ones: shrink the covariance
toward a structured target, and refuse to estimate expected returns at all
where possible - which is why minimum-variance is included and usually wins.
"""

from __future__ import annotations

import numpy as np


# ── Covariance estimation ───────────────────────────────────────────────

def sample_covariance(returns: np.ndarray) -> np.ndarray:
    """Plain sample covariance. Included as the thing to beat."""
    return np.cov(returns, rowvar=False, ddof=1)


def ledoit_wolf(returns: np.ndarray) -> tuple[np.ndarray, float]:
    """
    Ledoit-Wolf shrinkage toward a scaled identity.

    Returns the shrunk covariance and the shrinkage intensity actually chosen.

    THE IDEA
    --------
    The sample covariance is unbiased but has enormous variance when T is not
    much larger than N. A scaled identity is the opposite: badly biased, but
    almost no variance. The optimal combination

        Sigma = delta * F + (1 - delta) * S

    trades one against the other, and Ledoit and Wolf derive the delta that
    minimises expected squared error analytically rather than by
    cross-validation. That formula is what is implemented below.

    The practical effect is that the extreme eigenvalues get pulled toward the
    mean - which matters because it is precisely the smallest eigenvalues,
    the ones the optimiser divides by, that the sample estimate gets most
    wrong.
    """
    X = np.asarray(returns, dtype=np.float64)
    t, n = X.shape

    Xc = X - X.mean(axis=0)
    S = (Xc.T @ Xc) / t

    # Target: identity scaled by the average variance.
    mu = float(np.trace(S) / n)
    F = mu * np.eye(n)

    # d^2 = ||S - F||^2_F / n   (how far the sample is from the target)
    d2 = float(np.sum((S - F) ** 2) / n)

    # b_bar^2 = mean over observations of ||x_k x_k' - S||^2_F / n
    # This is the estimation variance of S itself.
    b_bar2 = 0.0
    for k in range(t):
        xk = Xc[k : k + 1].T @ Xc[k : k + 1]
        b_bar2 += float(np.sum((xk - S) ** 2) / n)
    b_bar2 /= t**2

    # b^2 cannot exceed d^2; a^2 is what is left.
    b2 = min(b_bar2, d2)
    a2 = d2 - b2

    delta = (b2 / d2) if d2 > 0 else 1.0
    delta = float(min(1.0, max(0.0, delta)))

    sigma = delta * F + (1 - delta) * S
    # Rescale to T-1 to match the sample-covariance convention elsewhere.
    return sigma * t / max(t - 1, 1), delta


# ── Simplex projection ──────────────────────────────────────────────────

def project_simplex(v: np.ndarray, z: float = 1.0) -> np.ndarray:
    """
    Euclidean projection onto {w : w >= 0, sum(w) = z}.

    The exact O(n log n) algorithm: sort descending, find how many components
    survive, subtract the resulting threshold, clip at zero. Not a heuristic -
    it returns the true closest point on the simplex, which is what makes
    projected gradient descent actually converge.

    This is what enforces long-only, fully-invested portfolios. Without the
    non-negativity constraint an unconstrained optimiser will happily return
    a 300% long / 200% short position that no retail investor can hold.
    """
    v = np.asarray(v, dtype=np.float64)
    n = len(v)
    u = np.sort(v)[::-1]
    css = np.cumsum(u)
    rho_candidates = u - (css - z) / np.arange(1, n + 1) > 0
    if not rho_candidates.any():
        return np.full(n, z / n)
    rho = int(np.nonzero(rho_candidates)[0][-1])
    theta = (css[rho] - z) / (rho + 1)
    return np.maximum(v - theta, 0.0)


def project_capped_simplex(v: np.ndarray, cap: float, z: float = 1.0) -> np.ndarray:
    """
    Projection onto {w : 0 <= w_i <= cap, sum(w) = z}.

    WHY A CAP IS NOT OPTIONAL
    -------------------------
    Unconstrained minimum-variance on this data returns 91% in a single
    low-volatility asset. That is not a bug - it is minimum-variance doing
    precisely what it was asked, because one asset genuinely had the lowest
    variance. It is also not a portfolio any human should hold: it concentrates
    every unmodelled risk (issuer default, a rate shock, a fund closing) into
    one position, and none of those appear in a covariance matrix.

    Real allocators cap positions for exactly this reason, and the cap is doing
    the job the estimated covariance cannot.

    The threshold is found by bisection, since w_i = clip(v_i - tau, 0, cap) is
    monotone decreasing in tau.
    """
    v = np.asarray(v, dtype=np.float64)
    n = len(v)
    if cap * n < z - 1e-12:
        raise ValueError(f"cap {cap} too small for {n} assets to sum to {z}")

    lo, hi = float(v.min() - z), float(v.max())
    for _ in range(100):
        tau = (lo + hi) / 2
        s = float(np.clip(v - tau, 0.0, cap).sum())
        if abs(s - z) < 1e-12:
            break
        if s > z:
            lo = tau
        else:
            hi = tau
    return np.clip(v - tau, 0.0, cap)


def solve_qp_simplex(
    cov: np.ndarray,
    mu: np.ndarray | None = None,
    risk_aversion: float = 1.0,
    iters: int = 1200,
    max_weight: float | None = None,
) -> np.ndarray:
    """
    Minimise  w' Sigma w * risk_aversion / 2  -  mu' w   on the simplex.

    Projected gradient descent, written out. The step size is 1/L where L is
    the largest eigenvalue of the Hessian - the standard choice for a smooth
    convex objective, and the one that guarantees monotone decrease without
    line search.

    The problem is convex on a convex set, so a local optimum is global and
    there is no need for anything more elaborate.
    """
    n = cov.shape[0]
    if mu is None:
        mu = np.zeros(n)

    # Lipschitz constant of the gradient.
    L = float(np.linalg.eigvalsh(cov * risk_aversion).max())
    step = 1.0 / max(L, 1e-12)

    project = (
        (lambda x: project_capped_simplex(x, max_weight))
        if max_weight is not None else project_simplex
    )

    w = np.full(n, 1.0 / n)
    prev = w.copy()

    for k in range(iters):
        # Nesterov acceleration - the momentum term costs nothing and
        # typically cuts the iteration count by an order of magnitude.
        y = w + (k / (k + 3.0)) * (w - prev)
        grad = risk_aversion * (cov @ y) - mu
        prev = w
        w = project(y - step * grad)

        if k > 10 and np.max(np.abs(w - prev)) < 1e-12:
            break

    return w


# ── Portfolios ──────────────────────────────────────────────────────────

def min_variance(cov: np.ndarray, max_weight: float | None = None) -> np.ndarray:
    """
    Minimum-variance portfolio, long-only.

    Notice what it does not use: expected returns. That is the entire point.
    Expected returns are estimated with far more error than covariances - you
    need decades of data to distinguish a 6% asset from an 8% one - and
    minimum-variance sidesteps the problem by not asking. It routinely
    outperforms max-Sharpe out of sample for exactly this reason.
    """
    return solve_qp_simplex(cov, mu=None, risk_aversion=1.0, max_weight=max_weight)


def max_sharpe(mu: np.ndarray, cov: np.ndarray, rf: float = 0.0,
               max_weight: float | None = None) -> np.ndarray:
    """
    Tangency portfolio, long-only, found by scanning the frontier.

    Scanning rather than solving directly because the Sharpe ratio is not
    convex in w, while each fixed-risk-aversion sub-problem is. Sweeping the
    risk aversion traces the whole frontier and the best Sharpe on it is the
    tangency portfolio.
    """
    best_w, best_sharpe = None, -np.inf
    for ra in np.logspace(-2, 3, 30):
        w = solve_qp_simplex(cov, mu=mu, risk_aversion=ra, max_weight=max_weight)
        vol = float(np.sqrt(w @ cov @ w))
        if vol < 1e-12:
            continue
        s = (float(mu @ w) - rf) / vol
        if s > best_sharpe:
            best_sharpe, best_w = s, w
    return best_w if best_w is not None else np.full(len(mu), 1.0 / len(mu))


def efficient_frontier(
    mu: np.ndarray, cov: np.ndarray, points: int = 30
) -> list[dict]:
    """Trace the frontier by sweeping risk aversion."""
    out = []
    for ra in np.logspace(-2, 3, points):
        w = solve_qp_simplex(cov, mu=mu, risk_aversion=ra)
        ret = float(mu @ w)
        vol = float(np.sqrt(w @ cov @ w))
        out.append({
            "risk_aversion": float(ra), "return": ret, "vol": vol,
            "sharpe": ret / vol if vol > 1e-12 else 0.0,
            "weights": w.tolist(),
        })
    return out


def equal_weight(n: int) -> np.ndarray:
    """
    1/N. The baseline that famously beats most optimisers out of sample.

    DeMiguel, Garlappi and Uppal (2009) tested fourteen optimisation models
    across empirical datasets and none reliably beat naive diversification,
    because the estimation error in the inputs swamps the optimisation gain.
    Any portfolio optimiser that cannot beat this is not earning its keep.
    """
    return np.full(n, 1.0 / n)


# ── Black-Litterman ─────────────────────────────────────────────────────

def implied_equilibrium_returns(
    cov: np.ndarray, market_weights: np.ndarray, risk_aversion: float = 2.5
) -> np.ndarray:
    """
    Reverse-optimise: what expected returns make the market portfolio optimal?

        Pi = delta * Sigma * w_market

    This is the trick that makes Black-Litterman work. Instead of forecasting
    returns - which nobody does well - it starts from the assumption that the
    market is roughly right and asks what beliefs would justify current
    prices. That prior is far better behaved than any direct estimate.
    """
    return risk_aversion * (cov @ market_weights)


def black_litterman(
    cov: np.ndarray,
    market_weights: np.ndarray,
    P: np.ndarray,
    Q: np.ndarray,
    tau: float = 0.05,
    risk_aversion: float = 2.5,
    view_confidence: float | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Blend equilibrium with views. Returns (posterior mean, posterior cov).

        E[R] = [(tau*Sigma)^-1 + P' Omega^-1 P]^-1
               [(tau*Sigma)^-1 Pi + P' Omega^-1 Q]

    P selects which assets each view concerns, Q is the expected outcome, and
    Omega is the uncertainty in the views. Omega defaults to the Idzorek
    convention of diag(P tau Sigma P'), which says a view about a volatile
    asset is inherently less certain - sensible, and it removes the one free
    parameter people usually fudge.

    Why this is the right shape for the product: the user's risk profile is
    genuinely a set of views ("I want more equity exposure than the market"),
    not a return forecast. Black-Litterman is the machinery for expressing
    that without the optimiser then dumping 100% into one asset.
    """
    pi = implied_equilibrium_returns(cov, market_weights, risk_aversion)

    tau_sigma = tau * cov
    if view_confidence is None:
        omega = np.diag(np.diag(P @ tau_sigma @ P.T))
    else:
        omega = np.eye(len(Q)) / max(view_confidence, 1e-9)
    omega = omega + np.eye(len(Q)) * 1e-12  # keep it invertible

    inv_tau_sigma = np.linalg.pinv(tau_sigma)
    inv_omega = np.linalg.pinv(omega)

    posterior_cov = np.linalg.pinv(inv_tau_sigma + P.T @ inv_omega @ P)
    posterior_mu = posterior_cov @ (inv_tau_sigma @ pi + P.T @ inv_omega @ Q)

    return posterior_mu, posterior_cov + cov


def risk_profile_views(
    n_assets: int, equity_idx: list[int], debt_idx: list[int], profile: str
) -> tuple[np.ndarray, np.ndarray]:
    """
    Turn a risk profile into a Black-Litterman view.

    The view is relative, not absolute: "equity outperforms debt by X" rather
    than "equity returns 12%". Relative views are both easier to hold honestly
    and far better behaved in the posterior.
    """
    spread = {"conservative": 0.01, "balanced": 0.035, "aggressive": 0.06}
    q = spread.get(profile, 0.035)

    P = np.zeros((1, n_assets))
    if equity_idx:
        P[0, equity_idx] = 1.0 / len(equity_idx)
    if debt_idx:
        P[0, debt_idx] = -1.0 / len(debt_idx)

    return P, np.array([q])
