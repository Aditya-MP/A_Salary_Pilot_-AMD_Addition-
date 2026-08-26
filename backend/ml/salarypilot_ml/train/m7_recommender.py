"""
M7 - Contextual bandit for lesson ordering.

    python -m salarypilot_ml.train.m7_recommender

MEASURED AGAINST AN ORACLE
--------------------------
A simulated user population has a TRUE reward function the policies cannot
see. That makes regret computable exactly - the gap between what the oracle
would have earned and what the policy actually earned - which is the only
clean way to evaluate a bandit offline. Evaluating on logged data instead
requires importance weighting and a logging policy we do not have.

THE HONEST TEST IS NOT "BEATS RANDOM"
-------------------------------------
Beating uniform random is trivial. The real bar is the heuristic already
shipping in the frontend: rank lessons by the user's weakest pillar. That rule
is sensible, free, and needs no data.

So the true reward function here is deliberately NOT perfectly aligned with it.
Lessons differ in intrinsic quality regardless of who reads them, and a couple
of cross-effects exist that no designer would think to hand-code. That is the
realistic situation: a heuristic encodes one person's theory, and the bandit
gets to find out where the theory is wrong.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from ..models.bandit import (
    EpsilonGreedy, FixedHeuristic, LinearThompson, LinUCB, RandomPolicy,
)

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"

PILLARS = ["runway", "debt", "savings", "protection", "growth"]
N_PILLARS = len(PILLARS)
N_ARMS = 14          # the curriculum
# Rounds are lesson impressions across the WHOLE user base, not per user -
# the bandit learns from everybody at once. 20,000 is a few thousand users.
#
# The first version of this ran to 4,000 and concluded "keep the heuristic".
# That conclusion was an artefact of the horizon: the crossover is at ~5,500,
# so stopping at 4,000 measured the warm-up and called it the result. Choosing
# a horizon shorter than the learning curve is one of the easiest ways to get
# a confidently wrong answer out of a bandit evaluation.
ROUNDS = 20000
SEEDS = [7, 11, 23, 42, 101]

# Context = 5 pillar scores + completion ratio + tenure + bias term.
D = N_PILLARS + 3


def build_world(rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """
    The true reward structure, hidden from every policy.

    Two components:

      pillar match      a lesson about debt genuinely helps a user weak in
                        debt - this part the heuristic can capture
      intrinsic quality some lessons are simply better written and land with
                        everyone - this part it cannot

    The second is what gives the bandit something to find. Without it the
    heuristic would be optimal by construction and the comparison would be
    rigged in the bandit's disfavour.
    """
    arm_pillars = np.zeros((N_ARMS, N_PILLARS))
    for a in range(N_ARMS):
        arm_pillars[a, a % N_PILLARS] = 1.0

    theta = np.zeros((N_ARMS, D))
    for a in range(N_ARMS):
        p = a % N_PILLARS
        # Negative weight on the matching pillar: a LOW score there (a weakness)
        # raises predicted reward.
        theta[a, p] = -0.9
        theta[a, N_PILLARS] = 0.15                    # completion ratio
        theta[a, N_PILLARS + 1] = 0.05                # tenure
        # Intrinsic quality, in the bias slot. Invisible to the heuristic.
        theta[a, N_PILLARS + 2] = rng.uniform(0.15, 0.75)

    # A couple of genuine cross-effects: some lessons also help an adjacent
    # weakness. Nobody would hand-code these; a bandit can learn them.
    for a in (2, 5, 9):
        theta[a, (a + 2) % N_PILLARS] = -0.35

    return arm_pillars, theta


def sample_context(rng: np.random.Generator) -> np.ndarray:
    """One user's state. Pillar scores in [0,1], where low means weak."""
    x = np.empty(D)
    x[:N_PILLARS] = rng.beta(2.2, 2.2, N_PILLARS)
    x[N_PILLARS] = rng.beta(1.5, 4.0)      # completion ratio, usually low
    x[N_PILLARS + 1] = rng.beta(1.5, 3.0)  # tenure
    x[N_PILLARS + 2] = 1.0                 # bias
    return x


def reward_prob(theta: np.ndarray, arm: int, x: np.ndarray) -> float:
    """Logistic link, so reward is a genuine Bernoulli outcome."""
    z = float(theta[arm] @ x)
    return 1.0 / (1.0 + np.exp(-z))


def run_seed(seed: int) -> dict:
    rng = np.random.default_rng(seed)
    arm_pillars, theta = build_world(rng)

    policies = [
        RandomPolicy(N_ARMS),
        FixedHeuristic(arm_pillars),
        EpsilonGreedy(N_ARMS, D, epsilon=0.10),
        LinUCB(N_ARMS, D, alpha=0.6),
        LinearThompson(N_ARMS, D, v=0.25),
    ]

    contexts = [sample_context(rng) for _ in range(ROUNDS)]
    # Oracle: the best arm for each context under the true model. Computed once
    # and shared, so every policy is scored against the identical benchmark.
    oracle = np.array([
        max(reward_prob(theta, a, x) for a in range(N_ARMS)) for x in contexts
    ])

    regret = {p.name: np.empty(ROUNDS) for p in policies}
    reward = {p.name: 0.0 for p in policies}

    for p in policies:
        prng = np.random.default_rng(seed + 1000)
        cum = 0.0
        for t, x in enumerate(contexts):
            arm = p.select(x, prng)
            prob = reward_prob(theta, arm, x)
            r = float(prng.random() < prob)
            p.update(arm, x, r)
            cum += oracle[t] - prob
            regret[p.name][t] = cum
            reward[p.name] += r

    return {
        "regret": {k: v.tolist() for k, v in regret.items()},
        "final_regret": {k: float(v[-1]) for k, v in regret.items()},
        "reward": {k: v / ROUNDS for k, v in reward.items()},
        "oracle_mean": float(oracle.mean()),
    }


def main() -> None:
    t0 = time.time()
    print("M7 - Contextual bandit for lesson ordering")
    print("=" * 76)
    print(f"\n  {N_ARMS} lessons, {D}-dim context, {ROUNDS:,} rounds, "
          f"{len(SEEDS)} seeds")
    print("  regret measured against an oracle that knows the true reward model")

    runs = [run_seed(s) for s in SEEDS]
    names = list(runs[0]["final_regret"].keys())

    def agg(name: str, key: str) -> np.ndarray:
        return np.array([r[key][name] for r in runs])

    oracle_mean = float(np.mean([r["oracle_mean"] for r in runs]))

    print(f"\n  {'policy':<20}{'final regret':>15}{'reward rate':>14}"
          f"{'% of oracle':>14}")
    print(f"  {'-' * 63}")

    ordered = sorted(names, key=lambda n: agg(n, "final_regret").mean())
    for name in ordered:
        reg = agg(name, "final_regret")
        rew = agg(name, "reward")
        tag = "  *" if name == "fixed heuristic" else ""
        print(f"  {name:<20}{reg.mean():>11.1f} +-{reg.std():<3.0f}"
              f"{rew.mean():>14.3f}{rew.mean() / oracle_mean * 100:>13.1f}%{tag}")
    print(f"  {'oracle':<20}{0.0:>15.1f}{oracle_mean:>14.3f}{100.0:>13.1f}%")
    print("  * what the frontend does today")

    # ── Where the crossover happens ──
    print(f"\n  CUMULATIVE REGRET OVER TIME")
    print(f"    {'round':>8}" + "".join(f"{n[:12]:>14}" for n in ordered))
    print("    " + "-" * (8 + 14 * len(ordered)))
    for t in (1000, 2500, 5000, 10000, ROUNDS - 1):
        row = f"    {t + 1:>8}"
        for name in ordered:
            v = float(np.mean([r["regret"][name][t] for r in runs]))
            row += f"{v:>14.1f}"
        print(row)

    heur = agg("fixed heuristic", "final_regret").mean()
    best_learner = min(
        (n for n in names if n not in ("random", "fixed heuristic")),
        key=lambda n: agg(n, "final_regret").mean(),
    )
    bl = agg(best_learner, "final_regret").mean()

    # Find the round where the best learner overtakes the heuristic.
    cross = None
    for t in range(ROUNDS):
        h = float(np.mean([r["regret"]["fixed heuristic"][t] for r in runs]))
        b = float(np.mean([r["regret"][best_learner][t] for r in runs]))
        if b < h:
            cross = t + 1
            break

    print(f"\n  {best_learner} vs the shipping heuristic")
    print(f"    final regret   {bl:.1f} vs {heur:.1f}   ({(1 - bl / heur) * 100:+.1f}%)")
    if cross:
        print(f"    overtakes it at round {cross:,} - before that the heuristic")
        print("    is genuinely better, because a hand-written rule needs no data")
        print("    and the bandit is still paying for its exploration.")
    else:
        print("    never overtakes it within the horizon.")

    print("\n" + "=" * 76)
    if bl < heur * 0.9:
        print(f"  SHIP {best_learner} - {(1 - bl / heur) * 100:.0f}% less regret than the")
        print(f"  heuristic, reaching {agg(best_learner, 'reward').mean() / oracle_mean * 100:.0f}% of oracle reward.")
        print()
        print("  Ship it BEHIND the heuristic, not instead of it: use the rule for")
        print(f"  the first ~{cross if cross else 1000:,} interactions and hand over once the bandit")
        print("  has earned it. A cold-start bandit shows people worse lessons")
        print("  than a sensible sort does, and that cost is real.")
        verdict = f"ship-{best_learner}-after-warmup"
    elif bl < heur:
        print(f"  MARGINAL - {best_learner} edges the heuristic by only")
        print(f"  {(1 - bl / heur) * 100:.1f}%. Not enough to justify the machinery yet.")
        verdict = "marginal"
    elif cross is None:
        print(f"  KEEP THE HEURISTIC over this horizon - but note the regret gap")
        print("  is still narrowing at the end, so this may be a horizon artefact")
        print("  rather than a real result. Re-run longer before deciding.")
        verdict = "keep-heuristic-inconclusive"
    else:
        print(f"  KEEP THE HEURISTIC - it beats every learner over {ROUNDS:,} rounds.")
        print("  Sorting by weakest pillar is simply a good rule, and a bandit")
        print("  that cannot beat it is complexity with no return.")
        verdict = "keep-heuristic"

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "m7_metrics.json").write_text(json.dumps({
        "model": "m7_bandit",
        "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "n_arms": N_ARMS, "context_dim": D, "rounds": ROUNDS, "seeds": SEEDS,
        "oracle_reward_rate": oracle_mean,
        "policies": {
            n: {"final_regret": float(agg(n, "final_regret").mean()),
                "reward_rate": float(agg(n, "reward").mean()),
                "pct_of_oracle": float(agg(n, "reward").mean() / oracle_mean * 100)}
            for n in names
        },
        "best_learner": best_learner,
        "crossover_round": cross,
        "verdict": verdict,
    }, indent=2), encoding="utf-8")

    print(f"\n  artifacts -> {ARTIFACTS / 'm7_metrics.json'}")
    print(f"  total {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
