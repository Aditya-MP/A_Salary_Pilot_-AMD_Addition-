"""
M4 - GARCH(1,1) volatility model.

WHY GARCH AND NOT A ROLLING STANDARD DEVIATION
----------------------------------------------
The first real fact about financial returns is that volatility clusters. Big
moves follow big moves and quiet follows quiet, so risk is not a constant to
be measured once - it is a state that persists and decays. A rolling standard
deviation reacts to a shock only after it has fully entered the window and
then drops it abruptly when it leaves, which is both late and jumpy.

GARCH models the variance as its own autoregressive process:

    sigma^2_t = omega + alpha * eps^2_{t-1} + beta * sigma^2_{t-1}

alpha is how sharply variance reacts to yesterday's shock; beta is how long it
remembers. Their sum is the persistence, and it has to stay below 1 or the
process has no finite unconditional variance and forecasts diverge.

WHAT IS HAND-WRITTEN HERE
-------------------------
The variance recursion, the Gaussian and Student-t log-likelihoods, the
constraint reparameterisation, and a plain gradient-free optimiser. SciPy's
minimiser is also available and is used as an independent cross-check - if two
different optimisers disagree about the maximum, the likelihood surface is the
problem, not the search.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy import optimize, special


# ── Constraint handling ─────────────────────────────────────────────────
# Rather than constrained optimisation, the parameters are reparameterised so
# every point in unconstrained R^3 maps to a valid, stationary GARCH. This is
# both simpler and better behaved than penalising violations after the fact.
#
#     omega = exp(t0)                  > 0
#     p     = sigmoid(t1)              persistence alpha+beta, in (0, 1)
#     q     = sigmoid(t2)              share of persistence carried by alpha
#     alpha = p * q,  beta = p * (1-q)
#
# Stationarity (alpha + beta = p < 1) then holds by construction and can never
# be violated mid-search.

def _sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    e = math.exp(x)
    return e / (1.0 + e)


def unpack(theta: np.ndarray) -> tuple[float, float, float]:
    omega = math.exp(min(theta[0], 20.0))
    p = _sigmoid(theta[1]) * 0.9995
    q = _sigmoid(theta[2])
    return omega, p * q, p * (1.0 - q)


def pack(omega: float, alpha: float, beta: float) -> np.ndarray:
    p = min(alpha + beta, 0.9990)
    q = alpha / p if p > 0 else 0.5
    return np.array([
        math.log(max(omega, 1e-12)),
        math.log(p / (1 - p)),
        math.log(max(q, 1e-6) / max(1 - q, 1e-6)),
    ])


# ── Core recursion ──────────────────────────────────────────────────────

def conditional_variance(
    eps: np.ndarray, omega: float, alpha: float, beta: float
) -> np.ndarray:
    """
    The GARCH(1,1) variance path.

    Seeded with the sample variance. The alternative, omega/(1-alpha-beta), is
    the unconditional variance and is a worse start: it is exactly the
    quantity the optimiser is still trying to estimate, so early in the search
    it can be wildly off and take hundreds of observations to wash out.
    """
    n = len(eps)
    sigma2 = np.empty(n)
    sigma2[0] = max(float(np.var(eps)), 1e-12)

    for t in range(1, n):
        sigma2[t] = omega + alpha * eps[t - 1] ** 2 + beta * sigma2[t - 1]
        if not np.isfinite(sigma2[t]) or sigma2[t] <= 0:
            sigma2[t] = 1e-12
    return sigma2


def neg_loglik_normal(theta: np.ndarray, eps: np.ndarray) -> float:
    """
    Negative Gaussian log-likelihood.

        LL = -0.5 * sum[ log(2*pi) + log(sigma^2_t) + eps^2_t / sigma^2_t ]

    Minimised rather than maximised purely by convention.
    """
    omega, alpha, beta = unpack(theta)
    sigma2 = conditional_variance(eps, omega, alpha, beta)
    if not np.all(np.isfinite(sigma2)) or np.any(sigma2 <= 0):
        return 1e12
    ll = -0.5 * np.sum(np.log(2 * np.pi) + np.log(sigma2) + eps**2 / sigma2)
    return float(-ll) if np.isfinite(ll) else 1e12


def neg_loglik_t(theta: np.ndarray, eps: np.ndarray) -> float:
    """
    Negative Student-t log-likelihood, with the degrees of freedom estimated
    alongside the variance parameters.

    Worth the extra parameter because financial returns have fat tails that a
    Gaussian cannot represent. Under a normal assumption a five-sigma day is
    effectively impossible; in real markets they arrive every few years, and a
    risk model that calls them impossible is the one that fails when it counts.
    """
    omega, alpha, beta = unpack(theta[:3])
    nu = 2.05 + math.exp(min(theta[3], 5.0))  # nu > 2 so the variance exists

    sigma2 = conditional_variance(eps, omega, alpha, beta)
    if not np.all(np.isfinite(sigma2)) or np.any(sigma2 <= 0):
        return 1e12

    # Scale so the t distribution has unit variance; otherwise nu and sigma
    # trade off against each other and neither is identified.
    scale = (nu - 2.0) / nu
    z2 = eps**2 / (sigma2 * scale)

    ll = np.sum(
        special.gammaln((nu + 1) / 2)
        - special.gammaln(nu / 2)
        - 0.5 * np.log(np.pi * nu)
        - 0.5 * np.log(sigma2 * scale)
        - (nu + 1) / 2 * np.log1p(z2 / nu)
    )
    return float(-ll) if np.isfinite(ll) else 1e12


# ── A hand-rolled optimiser ─────────────────────────────────────────────

def nelder_mead(f, x0: np.ndarray, iters: int = 800, tol: float = 1e-10):
    """
    Nelder-Mead simplex, implemented directly.

    Derivative-free by design: the analytic gradient of a GARCH likelihood is
    doable but fiddly, and a numerical gradient through a recursion this long
    is noisy enough to send a gradient method sideways. The simplex only ever
    compares function values, so none of that matters.

    Used here as an independent check on SciPy. Two different search
    algorithms landing on the same optimum is meaningful evidence; one
    algorithm reporting convergence is not.
    """
    n = len(x0)
    alpha_r, gamma_e, rho_c, sigma_s = 1.0, 2.0, 0.5, 0.5

    simplex = [np.array(x0, dtype=float)]
    for i in range(n):
        pt = np.array(x0, dtype=float)
        pt[i] += 0.5 if pt[i] == 0 else 0.1 * abs(pt[i])
        simplex.append(pt)

    vals = [f(p) for p in simplex]

    for _ in range(iters):
        order = np.argsort(vals)
        simplex = [simplex[i] for i in order]
        vals = [vals[i] for i in order]

        if abs(vals[-1] - vals[0]) < tol:
            break

        centroid = np.mean(simplex[:-1], axis=0)

        xr = centroid + alpha_r * (centroid - simplex[-1])
        fr = f(xr)
        if vals[0] <= fr < vals[-2]:
            simplex[-1], vals[-1] = xr, fr
            continue

        if fr < vals[0]:
            xe = centroid + gamma_e * (xr - centroid)
            fe = f(xe)
            simplex[-1], vals[-1] = (xe, fe) if fe < fr else (xr, fr)
            continue

        xc = centroid + rho_c * (simplex[-1] - centroid)
        fc = f(xc)
        if fc < vals[-1]:
            simplex[-1], vals[-1] = xc, fc
            continue

        for i in range(1, len(simplex)):
            simplex[i] = simplex[0] + sigma_s * (simplex[i] - simplex[0])
            vals[i] = f(simplex[i])

    best = int(np.argmin(vals))
    return simplex[best], vals[best]


# ── Model ───────────────────────────────────────────────────────────────

@dataclass
class GARCH11:
    omega: float = 0.0
    alpha: float = 0.0
    beta: float = 0.0
    nu: float | None = None          # None means Gaussian innovations
    loglik: float = 0.0
    sigma2_: np.ndarray | None = None
    mu: float = 0.0

    @property
    def persistence(self) -> float:
        return self.alpha + self.beta

    @property
    def half_life(self) -> float:
        """Days for a variance shock to decay by half. The intuitive reading."""
        p = self.persistence
        return math.log(0.5) / math.log(p) if 0 < p < 1 else float("inf")

    @property
    def unconditional_vol(self) -> float:
        p = self.persistence
        return math.sqrt(self.omega / (1 - p)) if p < 1 else float("nan")

    def standardised(self, returns: np.ndarray) -> np.ndarray:
        """z_t = eps_t / sigma_t. Should be roughly i.i.d. if the fit is good."""
        eps = returns - self.mu
        s2 = conditional_variance(eps, self.omega, self.alpha, self.beta)
        return eps / np.sqrt(s2)

    def forecast_vol(self, returns: np.ndarray, horizon: int = 1) -> np.ndarray:
        """
        Multi-step variance forecast.

        Beyond one step the expected variance mean-reverts toward the
        unconditional level at rate (alpha+beta)^h - which is the useful
        property: a panic today does not imply permanent risk.
        """
        eps = returns - self.mu
        s2 = conditional_variance(eps, self.omega, self.alpha, self.beta)

        out = np.empty(horizon)
        last = self.omega + self.alpha * eps[-1] ** 2 + self.beta * s2[-1]
        out[0] = last
        uncond = self.omega / (1 - self.persistence) if self.persistence < 1 else last
        for h in range(1, horizon):
            out[h] = uncond + (self.persistence**h) * (last - uncond)
        return np.sqrt(out)


def fit_garch(
    returns: np.ndarray,
    student_t: bool = False,
    cross_check: bool = True,
) -> GARCH11:
    """Fit GARCH(1,1) by maximum likelihood."""
    returns = np.asarray(returns, dtype=np.float64)
    mu = float(returns.mean())
    eps = returns - mu

    var = max(float(np.var(eps)), 1e-12)
    # Standard empirical starting point: high persistence, most of it in beta.
    x0 = pack(var * 0.05, 0.08, 0.90)

    if student_t:
        x0 = np.append(x0, math.log(6.0 - 2.05))
        obj = lambda t: neg_loglik_t(t, eps)
    else:
        obj = lambda t: neg_loglik_normal(t, eps)

    res = optimize.minimize(obj, x0, method="Nelder-Mead",
                            options={"maxiter": 4000, "xatol": 1e-9, "fatol": 1e-9})
    best_x, best_f = res.x, float(res.fun)

    if cross_check:
        # Independent search from the same start. If the hand-rolled simplex
        # finds a better optimum, take it - and the disagreement itself is
        # information about how flat the surface is.
        mine_x, mine_f = nelder_mead(obj, x0)
        if mine_f < best_f:
            best_x, best_f = mine_x, mine_f

    omega, alpha, beta = unpack(best_x[:3])
    nu = (2.05 + math.exp(min(best_x[3], 5.0))) if student_t else None

    return GARCH11(
        omega=omega, alpha=alpha, beta=beta, nu=nu,
        loglik=-best_f, mu=mu,
        sigma2_=conditional_variance(eps, omega, alpha, beta),
    )


# ── Simulation, for the parameter-recovery test ─────────────────────────

def simulate(
    n: int,
    omega: float,
    alpha: float,
    beta: float,
    nu: float | None = None,
    seed: int = 0,
    burn: int = 500,
) -> np.ndarray:
    """
    Draw a return series from a GARCH(1,1) with known parameters.

    This exists so the estimator can be tested against a truth it cannot see.
    If a fitter cannot recover parameters it generated itself, no result it
    produces on real data means anything.
    """
    rng = np.random.default_rng(seed)
    total = n + burn
    out = np.empty(total)
    s2 = omega / max(1e-9, 1 - alpha - beta)

    if nu is None:
        z = rng.standard_normal(total)
    else:
        z = rng.standard_t(nu, total) * math.sqrt((nu - 2) / nu)

    eps_prev = 0.0
    for t in range(total):
        s2 = omega + alpha * eps_prev**2 + beta * s2
        eps = math.sqrt(max(s2, 1e-18)) * z[t]
        out[t] = eps
        eps_prev = eps

    return out[burn:]
