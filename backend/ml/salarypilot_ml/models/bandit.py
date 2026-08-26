"""
M7 - Contextual bandit for lesson ordering.

Replaces `prioritiseLessons()` in the frontend, which is a sort function over
the user's weakest Freedom Score pillar.

WHY A BANDIT AND NOT A CLASSIFIER
---------------------------------
There are no labels to train on. Nobody has ever told us which lesson helps
which user, and the only way to find out is to show lessons and watch what
happens - which means the system generates its own training data through the
actions it takes. That is the bandit setting exactly.

It also has the property the sort function lacks: it can discover something
the designer did not encode. The current heuristic encodes one person's belief
that people should read about their weakest area first. That belief is
reasonable and it is also just a guess. A bandit measures.

THE EXPLORATION PROBLEM
-----------------------
Always showing the lesson you currently believe is best means never learning
whether something else was better - the estimate that put it in second place
was made from almost no data, and it never gets corrected. Always exploring
means never using what you know.

LinUCB resolves this with optimism: rank each arm by its predicted reward PLUS
a confidence bonus that shrinks as that arm accumulates data. An arm is tried
either because it looks good or because it is poorly understood, and the bonus
term makes those two reasons commensurable rather than requiring a hand-tuned
exploration rate.
"""

from __future__ import annotations

import numpy as np


class Policy:
    """Interface every arm-selection strategy implements."""

    name = "policy"

    def select(self, context: np.ndarray, rng: np.random.Generator) -> int:
        raise NotImplementedError

    def update(self, arm: int, context: np.ndarray, reward: float) -> None:
        pass


class RandomPolicy(Policy):
    """Uniform choice. The floor - anything that cannot beat this is broken."""

    name = "random"

    def __init__(self, n_arms: int) -> None:
        self.n_arms = n_arms

    def select(self, context: np.ndarray, rng: np.random.Generator) -> int:
        return int(rng.integers(0, self.n_arms))


class FixedHeuristic(Policy):
    """
    What the frontend does today: rank lessons by the user's weakest pillar.

    A genuinely reasonable rule, and the real bar. Beating random is easy;
    beating a sensible hand-written heuristic is the question that decides
    whether the bandit is worth the machinery.
    """

    name = "fixed heuristic"

    def __init__(self, arm_pillars: np.ndarray) -> None:
        # arm_pillars[a] is the one-hot pillar each lesson addresses.
        self.arm_pillars = arm_pillars

    def select(self, context: np.ndarray, rng: np.random.Generator) -> int:
        # context[:5] holds pillar scores; lower is weaker.
        weakest = int(np.argmin(context[: self.arm_pillars.shape[1]]))
        matching = np.nonzero(self.arm_pillars[:, weakest] > 0)[0]
        return int(rng.choice(matching)) if len(matching) else 0


class EpsilonGreedy(Policy):
    """
    Explore at random with probability epsilon, otherwise exploit.

    The obvious approach, and its weakness is instructive: exploration is
    uniform, so it keeps re-testing arms it has already established are bad
    with the same probability as genuinely uncertain ones. LinUCB spends its
    exploration where the uncertainty actually is.
    """

    name = "epsilon-greedy"

    def __init__(self, n_arms: int, d: int, epsilon: float = 0.1) -> None:
        self.n_arms, self.d, self.epsilon = n_arms, d, epsilon
        self.A = [np.eye(d) for _ in range(n_arms)]
        self.b = [np.zeros(d) for _ in range(n_arms)]

    def select(self, context: np.ndarray, rng: np.random.Generator) -> int:
        if rng.random() < self.epsilon:
            return int(rng.integers(0, self.n_arms))
        scores = [
            float(np.linalg.solve(self.A[a], self.b[a]) @ context)
            for a in range(self.n_arms)
        ]
        return int(np.argmax(scores))

    def update(self, arm: int, context: np.ndarray, reward: float) -> None:
        self.A[arm] += np.outer(context, context)
        self.b[arm] += reward * context


class LinUCB(Policy):
    """
    Li, Chu, Langford and Schapire (2010), disjoint linear model.

    Each arm keeps its own ridge regression of reward on context:

        theta_a = A_a^-1 b_a
        score_a = theta_a . x  +  alpha * sqrt(x' A_a^-1 x)

    The second term is a confidence radius. x' A^-1 x is large in directions of
    context space this arm has rarely been shown in, so the bonus is high for
    arms that are genuinely uncertain in THIS situation rather than merely
    under-tried overall. That context-sensitivity is what makes it contextual
    rather than a plain UCB per arm.

    A_a starts at the identity, which is the ridge prior. It also guarantees
    invertibility from the very first round, so there is no cold-start special
    case to get wrong.
    """

    name = "LinUCB"

    def __init__(self, n_arms: int, d: int, alpha: float = 0.6) -> None:
        self.n_arms, self.d, self.alpha = n_arms, d, alpha
        self.A = [np.eye(d) for _ in range(n_arms)]
        self.b = [np.zeros(d) for _ in range(n_arms)]

    def select(self, context: np.ndarray, rng: np.random.Generator) -> int:
        best, best_score = 0, -np.inf
        for a in range(self.n_arms):
            A_inv = np.linalg.inv(self.A[a])
            theta = A_inv @ self.b[a]
            mean = float(theta @ context)
            bonus = self.alpha * float(np.sqrt(context @ A_inv @ context))
            score = mean + bonus
            if score > best_score:
                best, best_score = a, score
        return best

    def update(self, arm: int, context: np.ndarray, reward: float) -> None:
        self.A[arm] += np.outer(context, context)
        self.b[arm] += reward * context


class LinearThompson(Policy):
    """
    Thompson sampling over a Bayesian linear model.

    Instead of an explicit confidence bonus, draw a plausible parameter vector
    from each arm's posterior and act as if it were true. Exploration falls out
    of posterior width: a poorly-understood arm has a wide posterior and
    occasionally draws a high value, so it gets tried.

    Usually matches or beats LinUCB in practice despite weaker theory, and it
    has one free parameter instead of one that needs tuning per problem.
    """

    name = "Thompson"

    def __init__(self, n_arms: int, d: int, v: float = 0.25) -> None:
        self.n_arms, self.d, self.v = n_arms, d, v
        self.A = [np.eye(d) for _ in range(n_arms)]
        self.b = [np.zeros(d) for _ in range(n_arms)]

    def select(self, context: np.ndarray, rng: np.random.Generator) -> int:
        best, best_score = 0, -np.inf
        for a in range(self.n_arms):
            A_inv = np.linalg.inv(self.A[a])
            mu = A_inv @ self.b[a]
            # Draw from N(mu, v^2 A^-1). Cholesky keeps it positive definite
            # even when A_inv has picked up floating-point asymmetry.
            cov = self.v**2 * A_inv
            try:
                L = np.linalg.cholesky(cov + 1e-9 * np.eye(self.d))
                theta = mu + L @ rng.standard_normal(self.d)
            except np.linalg.LinAlgError:
                theta = mu
            score = float(theta @ context)
            if score > best_score:
                best, best_score = a, score
        return best

    def update(self, arm: int, context: np.ndarray, reward: float) -> None:
        self.A[arm] += np.outer(context, context)
        self.b[arm] += reward * context
