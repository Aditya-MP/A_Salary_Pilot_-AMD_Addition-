# SalaryPilot Backend

Go core service + Python ML service. See the
[architecture blueprint](https://claude.ai/code/artifact/245b98ca-63ff-49ab-9bab-4c4c5b70e002)
for the reasoning behind every choice here.

---

## Status

| Component | State |
|---|---|
| **Go API service** | **builds, vets, tests pass, runs** |
| **Auth — argon2id + JWT** | **11 tests green, incl. alg-confusion** |
| **Runway + Freedom engines (Go port)** | **golden-tested against the live TypeScript** |
| **All seven models (M1–M7)** | **built, measured, gated** |
| Database schema (3 migrations) | written — blocked on the Docker daemon |
| Docker Compose stack | written — blocked on the Docker daemon |
| Protobuf contracts | not started |
| Model serving behind the Go API | not started |

### The seven models, and what the evidence actually said

| model | verdict |
|---|---|
| **M1** Transaction Categoriser | clears baseline 22× on macro-F1 |
| **M1-v2** Behavioural features | **ships** — +0.15 unseen macro-F1, 7/7 seeds |
| **M2** Recurring Detector | **not shipped** — 0.70 precision, human-confirm only |
| **M3** Cash-flow Forecaster | **split** — mean for the total, Holt-Winters for the curve |
| **M4** GARCH / VaR | **ships for the forecast**, not the VaR |
| **M5** Portfolio Optimiser | **ships for risk reduction**, not return |
| **M6** Monte Carlo Simulator | **ships** |
| **M7** Contextual Bandit | **ships behind the heuristic**, after ~4,300 impressions |

Not one of the seven shipped exactly as originally scoped. Every one was
narrowed, split, deferred or disqualified by its own evidence — which is the
gates working rather than a series of setbacks.

### Bugs the gates caught, mostly in my own code

| where | bug |
|---|---|
| M1 | 99.2% accuracy meant the *data* was too easy, not the model good; holdout was computed and never enforced |
| M1-v2 | macro-F1 averaged over classes the test set could not contain, capping the score at 0.42 |
| M2 | ACF took the global max, which is a **harmonic** — a 30-day subscription read as 90-day |
| M2 | `acf_strength` computed and never used, so noise scored 0.72 confidence |
| M3 | conformal quantile missing its finite-sample correction — 81% coverage against a nominal 90% |
| M3 | the ship gate printed "must not ship" about the intervals, then shipped, because it only checked MASE |
| M5 | unconstrained optimiser put 91% in one asset and posted the best Sharpe for it |
| M6 | percentiles filtered to survivors — reported "median age 62" when the true median was **never** |
| M6 | expenses inflated while returns were treated as real: deflating twice |
| M7 | horizon shorter than the learning curve produced a confident, wrong verdict |

Go 1.26.7 verified. Docker Desktop 4.88 is installed but its **daemon has not
started** — it needs its one-time GUI setup (licence acceptance and the WSL2
backend) before `docker compose up` will work. Everything that does not need
the daemon has been run; nothing is claimed working that has not been executed.

---

## Verified commands

```bash
cd backend/go-api
go build ./...      # OK
go vet ./...        # OK
go test ./...       # ok  internal/auth   ok  internal/engine

cd ../ml
python -m salarypilot_ml.train.m1_categoriser   # PASS, ~2s
```

Live check against a running server, with Postgres deliberately down:

```
GET /healthz  ->  200  {"status":"ok"}                    liveness, no deps
GET /readyz   ->  503  {"status":"database unreachable"}  readiness, checks deps
GET /v1/me    ->  401  no token
GET /v1/me    ->  401  token forged with alg=none
```

The service starts and serves even with the database down. That is deliberate:
a service that refuses to boot because a dependency is briefly unavailable
turns a short outage into a manual restart.

---

## To unblock the database

Open **Docker Desktop** from the Start menu once and complete first-run setup
(accept the licence, let it install the WSL2 backend). Then:

```bash
cd backend
docker compose up -d      # migrations apply automatically on first boot
docker compose ps         # all four services healthy
```

That brings up Timescale, Valkey, Redpanda and MLflow, and applies all three
migrations. After that `GET /readyz` returns 200 and register/login work
end to end.

---

## M1 · Transaction Categoriser — current results

Turns a raw bank narration into a spending category. Character 3–5 gram
TF-IDF into multinomial logistic regression, **both written from scratch** —
the vectoriser computes its own document frequencies and IDF weighting, and
the classifier implements the softmax, the cross-entropy objective, the
analytic gradient and the SGD loop directly. No scikit-learn.

Chronological split, never random: shuffling a dated transaction stream leaks
the future into training.

Averaged over **7 data seeds**, 829 held-out transactions in total:

| arm | seen macro-F1 | unseen macro-F1 | unseen accuracy |
|---|---|---|---|
| Majority-class baseline | 0.043 | 0.043 | 0.343 |
| v1 — text only (9,360 features) | **0.979** | 0.281 | 0.270 |
| b — behaviour only (27 features) | 0.447 | 0.370 | 0.369 |
| **v2 — text + behaviour** | 0.932 | **0.444** | **0.482** |

Paired deltas, same split each time — **v2 wins 7 of 7 seeds**:

```
unseen macro-F1   +0.1631 +-0.0590     7/7
unseen accuracy   +0.2123 +-0.0754     7/7
seen   macro-F1   -0.0468 +-0.0083     0/7
unseen ECE         0.431 -> 0.287      better calibrated too
```

### The cold-start problem, and what fixed it

v1 was excellent on merchants it had seen and collapsed on merchants it had
not. That was never a tuning failure — it is the ceiling of the feature set.
A bag of character n-grams has exactly one signal, the merchant string, so a
vendor it has never encountered is genuinely unclassifiable. A human reading
`NYKAA` cold cannot categorise it either.

It matters because **every new user arrives as an entirely unseen-merchant
problem**. Their first month is the worst the model will ever perform, which
is exactly when they decide whether to trust the product.

The fix was signal, not capacity — features that describe what a payment *is
like* rather than *who it went to*:

- **amount** on a log scale, plus bucketing — a recurring ₹149 debit is a
  subscription no matter the payee
- **roundness** — rent is exactly 32,000; a restaurant bill is 347
- **channel** — a NACH mandate is almost always an EMI or a subscription;
  nobody sets up a direct debit for lunch
- **direction** — credits are income or transfers, never groceries
- **day-of-month**, encoded as sine/cosine so the 30th and the 1st sit next
  to each other rather than at opposite ends of the range

### The most interesting line in the table

**27 hand-designed behavioural features beat 9,360 character n-grams on
unseen merchants** — 0.370 against 0.281, with no text input at all.

Feature design beat model capacity by a wide margin, and it is the reason
this work landed before the CNN rather than after it.

### Two corrections that changed the answer

The first single-seed run said *keep v1*. It was wrong twice over, and both
bugs were on the measurement side:

1. **Macro-F1 was averaging over classes the test set could not contain.**
   The unseen holdout has 5 of 12 categories; scoring the missing 7 as F1 = 0
   capped the achievable number at 0.42 and buried a real effect. Fixed in
   `metrics.py` — a perfect model on 3 of 12 present classes now scores 1.0,
   not 0.25.

2. **One holdout of ~160 transactions is not evidence.** Everything now runs
   across seven seeds with paired deltas, so a lucky split cannot carry the
   decision.

The seen-merchant regression of 0.047 is real and is the price of a single L2
penalty shared across two blocks of very different scale. Worth revisiting;
not worth blocking on, because cold start is where users are lost.

---

## M7 · Contextual Bandit — ships, behind the heuristic

Thompson sampling and LinUCB over a Bayesian linear model, both written out.
Replaces `prioritiseLessons()`, a sort over the user's weakest pillar.

Evaluated against an **oracle** that knows the true reward function, so regret
is computable exactly rather than estimated. 14 arms, 8-dim context, 20,000
rounds, 5 seeds.

| policy | final regret | % of oracle reward |
|---|---|---|
| **Thompson** | **502** | **96.3%** |
| LinUCB | 592 | 95.0% |
| epsilon-greedy | 619 | 94.8% |
| fixed heuristic *(shipping today)* | 941 | 92.0% |
| random | 1979 | 83.5% |

### The horizon nearly gave me the wrong answer

The first run used 4,000 rounds and concluded **"keep the heuristic"** — every
learner lost. The regret curve was still narrowing at the end, which was the
tell:

| round | heuristic | Thompson | gap |
|---|---|---|---|
| 1,000 | 46.8 | 71.1 | +52% |
| 2,500 | 117.6 | 141.1 | +20% |
| **5,000** | **235.2** | **227.4** | **−3%** |
| 10,000 | 471.5 | 340.7 | −28% |
| 20,000 | 941.3 | 502.3 | **−47%** |

**The crossover is at round ~4,300.** Stopping at 4,000 measured the warm-up
and reported it as the result. Choosing a horizon shorter than the learning
curve is one of the easiest ways to get a confidently wrong answer out of a
bandit evaluation, and I got it before catching it.

### Ship it behind the heuristic, not instead of it

Before ~4,300 impressions the heuristic is genuinely better — a hand-written
rule needs no data, while the bandit is still paying for exploration. A
cold-start bandit shows people worse lessons than a sensible sort does, and
that cost is real and falls on early users.

So: serve the heuristic first, hand over once the bandit has earned it. Rounds
are impressions across the *whole* user base, not per user, so 4,300 is a few
hundred users — reachable, not theoretical.

### Why the true reward was built to defeat the heuristic

The simulated reward has an **intrinsic quality** term: some lessons land with
everyone regardless of context. The heuristic cannot represent that at all,
and two cross-effects were added that no designer would think to hand-code.

That is the realistic situation and the honest framing of the whole model: a
heuristic encodes one person's theory about what helps, and the bandit's job
is to find out where the theory is wrong. Had the reward been pure pillar
matching, the heuristic would have been optimal by construction and the
comparison would have been rigged in the bandit's disfavour.

---

## M6 · Monte Carlo Freedom Simulator — ships

10,000 paths, 40-year horizon, stationary block bootstrap (Politis–Romano).
Simulates returns, real salary growth, a job-loss hazard, lumpy shocks and
portfolio drawdown, then reports the **distribution** rather than a number.

### 1 · The resampler keeps what matters

| property | original | block | IID |
|---|---|---|---|
| mean monthly return | −0.00044 | −0.00047 | −0.00058 |
| monthly volatility | 0.04502 | 0.04507 | 0.04519 |
| **volatility clustering** | **0.115** | **0.077** | **−0.001** |

Block keeps **67%** of the clustering. IID keeps **−1%** — it destroys it
entirely.

And notice the trap: both bootstraps match the mean and the volatility
essentially exactly. An IID bootstrap looks perfectly rigorous on every
summary statistic while having silently deleted the sequence-of-returns risk
that actually ruins retirements. A crash early is far worse than the same
crash late; IID cannot generate that scenario at all.

### 2 · The probabilities are calibrated

Probability integral transform over **non-overlapping** windows — stepping by
less than the horizon makes consecutive PIT values share most of their data,
so they are not independent draws and the coverage estimate is not what it
claims.

| interval | nominal | block |
|---|---|---|
| 5%–95% | 0.90 | **0.93** |
| 10%–90% | 0.80 | 0.80 |
| 25%–75% | 0.50 | 0.53 |

Mean PIT 0.462 against an unbiased 0.500.

### 3 · What it says, and the bug that nearly hid it

| | age |
|---|---|
| best 10% | 60.6 |
| P25 | 68.9 |
| **median** | **never** |
| reaches FI in 40 years | **25.1% of paths** |

**The bug worth reading about.** The first version filtered to finite values
before taking percentiles — so it reported the median *among paths that
succeeded*. With 87% of paths never reaching FI, it printed a confident
"median age 62" when the true median outcome was **never**. Survivorship bias,
in the single headline number, inside the model built specifically to remove
that kind of bias. Percentiles now run over all paths and `never` prints as
`never`.

### The assumption doing all the work

Before anyone panics at 25%: that number is dominated by one input.

| real return | reaches FI | median age | best decile |
|---|---|---|---|
| 3.0% | 20.3% | never | 62.4 |
| 4.5% | 36.6% | never | 57.9 |
| 6.0% | 56.6% | 66.7 | 54.1 |
| **7.5%** *(frontend's assumption)* | **73.7%** | **61.7** | 51.3 |
| 9.0% | 86.8% | 57.7 | 49.2 |

The frontend assumes 7.5% real. This run used 3.5%. Both are defensible and
they produce completely different lives. **That gap is the most important
thing to show the user**, and a point estimate hides it entirely — which is
the whole argument for this model.

A second accounting bug was fixed along the way: an earlier version inflated
the expense base at 5.5% while treating returns as real, deflating twice. The
FI target grew while the portfolio did not, which made the plan look
impossible for what was a units error rather than a fact about the user.
Everything is now consistently in real terms.

---

## M5 · Portfolio Optimiser — ships, but not for the reason you'd think

Ledoit-Wolf shrinkage (including the shrinkage-intensity formula), Euclidean
projection onto the simplex, a capped-simplex projection, a projected-gradient
QP solver with Nesterov acceleration, the efficient frontier, and
Black-Litterman — all written out. Replaces `TARGET_MIX`, a dictionary of
numbers somebody typed in.

Rolling 500-day estimation, 63-day hold, 3 market paths. Weights are never
chosen using returns they are later scored on.

| strategy | return | vol | Sharpe | maxDD | max pos |
|---|---|---|---|---|---|
| ~~min-var uncapped~~ | 3.7% | 4.0% | *0.806* | −4.9% | **88%** |
| **min-var (Ledoit-Wolf, capped)** | 4.3% | **8.3%** | 0.444 | **−15.4%** | 35% |
| min-var (sample cov, capped) | 4.3% | 8.3% | 0.442 | −15.4% | 35% |
| max-Sharpe (LW) | 5.5% | 12.1% | 0.426 | −22.5% | 35% |
| **1/N equal weight** *(the bar)* | 6.4% | 18.0% | 0.356 | −34.5% | 17% |
| Black-Litterman | 4.4% | 21.0% | 0.232 | −41.5% | 35% |

### The best Sharpe was disqualified

Unconstrained minimum-variance posts the top Sharpe (0.806) by holding **88% in
one asset**. That is minimum-variance doing exactly what it was asked — one
asset genuinely had the lowest variance — and it is still not a portfolio
anyone should hold. A covariance matrix cannot see issuer default, a rate
shock, or a fund closing. Optimising freely against an estimated matrix
concentrates you in whatever the estimate got most wrong.

So a 35% position cap went in, and the uncapped row stays in the output as a
*diagnostic* rather than a candidate. It is the failure mode, kept visible.

### Ship it for risk reduction, not for return

Capped minimum-variance beats 1/N by **+0.088 Sharpe, winning 2 of 3 paths** —
which is thin, and honestly so. The literature is unambiguous here: DeMiguel,
Garlappi and Uppal tested fourteen optimisation models and none reliably beat
naive diversification, because estimation error swamps the optimisation gain.

But Sharpe is not what minimum-variance is for. On its own objective:

- **volatility −54%** vs 1/N
- **max drawdown −60%** vs 1/N (−15% instead of −35%)

For a first-time investor deciding whether they can stomach staying invested,
halving the drawdown is worth more than a tenth of a Sharpe point. That is the
claim, and it is the one the numbers support.

### Shrinkage did nothing, and that is the correct answer

Mean shrinkage intensity came out at **0.011** — Ledoit-Wolf barely moved the
matrix, and its Sharpe gain over plain sample covariance was +0.001.

That is not a failed implementation. With T=500 and N=6 the sample covariance
is already well estimated, so the optimal shrinkage genuinely is near zero.
Shrinkage is insurance; this is what it looks like when the insured risk is
absent. Testing it only in that regime would have been the real mistake:

| T | T/N | shrinkage | cond(sample) | cond(LW) |
|---|---|---|---|---|
| **30** | **5** | **0.079** | **371** | **48** |
| 60 | 10 | 0.039 | 436 | 92 |
| 120 | 20 | 0.025 | 407 | 123 |
| 500 | 83 | 0.008 | 405 | 239 |

At T=30 it cuts the condition number roughly **eightfold** — and that is
exactly the regime a new user is in during their first months, which is when
bad weights do the most damage.

### Black-Litterman came last

Worst Sharpe of any capped method (0.232) and the deepest drawdown. The views
push toward equity, and in these simulated paths equity underperformed — so
the machinery faithfully expressed an opinion that happened to be wrong. That
is the honest description: Black-Litterman is a mechanism for encoding beliefs,
not for having correct ones. Keep it available for users who want to express a
tilt; do not present it as the default.

---

## M4 · GARCH Volatility & VaR — ships for the forecast

GARCH(1,1) fitted by maximum likelihood. The variance recursion, the Gaussian
and Student-t log-likelihoods, the constraint reparameterisation and a
Nelder-Mead simplex are all written out; SciPy's minimiser runs alongside as an
independent cross-check, because one optimiser reporting convergence is not
evidence and two agreeing is.

Replaces the invented "30% high / 45% medium / 25% low" risk bars on the
Portfolio page — three numbers that were typed into a file.

### 1 · Parameter recovery — does the estimator work at all?

Simulate from a GARCH with known parameters, then fit it back. If it cannot
recover parameters it generated itself, nothing it says about real data means
anything, and every number below would be decoration.

| parameter | worst-case error |
|---|---|
| persistence (α+β) | **1.1%** |
| ω | 2.9% |
| β | 0.7% |
| α | 15.7% |

α is the loose one, and that is expected rather than a defect: the likelihood
is nearly flat along the α/β trade-off, so the split between them is weakly
identified while their **sum** — the quantity that actually drives forecasts —
is pinned down tightly.

### 2 · VaR backtest — 95% one-day, walk-forward

Two tests, and both must pass. **Kupiec** checks the exceedance *rate*.
**Christoffersen** checks the exceedances do not *cluster* — a model can breach
exactly 5% of the time and still be useless if every breach lands in the same
fortnight, which is the model failing precisely when risk is high.

| method | regimes passed | mean \|hit − 0.05\| |
|---|---|---|
| **garch normal** | **3/3** | **0.0030** |
| garch + FHS | 3/3 | 0.0056 |
| ewma 0.94 (RiskMetrics) | 3/3 | 0.0075 |
| constant volatility | 2/3 | 0.0119 |

**Constant volatility failed the equity regime on *both* tests** — Kupiec
p = 0.002, independence p = 0.008. That is the textbook signature of ignoring
volatility clustering, and it is the entire reason this model exists.

### The honest verdict: GARCH ships, but not for the reason you'd expect

EWMA also passes 3/3, and it is one line of code. On the binary test that is a
tie, and "passes" is the bar that matters — so the VaR number could come from
either.

GARCH earns its place on a different question. EWMA gives a volatility
**level**; GARCH gives a **term structure** with mean reversion, because
variance decays toward its unconditional value at rate (α+β)^h. That is what
lets the Portfolio page say *"risk is elevated and decays to normal over about
35 days"* — a statement EWMA cannot make at all.

Ship it for the forecast. The VaR is a bonus, and it is better calibrated
(0.0030 vs 0.0075) even if both clear the test.

### Also worth knowing

Student-t innovations are supported and estimated jointly with the variance
parameters. Under a Gaussian assumption a five-sigma day is effectively
impossible; in real markets they arrive every few years, and a risk model that
calls them impossible is the one that fails when it counts.

Expected Shortfall is reported next to VaR throughout. VaR tells you how far
the cliff edge is and nothing about the drop — measured here, ES runs
1.4–1.6× VaR. It is also coherent, respecting diversification, which VaR
provably does not.

---

## M3 · Cash-flow Forecaster — split decision

Holt-Winters triple exponential smoothing, written out: the level, trend and
seasonal recursions, initialisation, damped trend, and a grid search over the
smoothing parameters. Evaluated by **walk-forward origin backtest** across
3 seeds and 22 origins each — fit on everything before *t*, forecast 90 days,
roll *t* forward. No model ever sees a value it is later asked to predict.

**Daily accuracy** — MASE, scaled by seasonal-naive:

| model | MASE | sMAPE % |
|---|---|---|
| **holt_winters** | **0.789** | 85.5 |
| mean | 0.842 | 91.2 |
| naive | 0.887 | 105.5 |
| seasonal_naive *(the bar)* | 1.005 | 102.1 |

**90-day burn total** — what runway actually asks for:

| model | abs err % | bias % |
|---|---|---|
| **mean** | **6.4** | +1.7 |
| seasonal_naive | 13.5 | +1.2 |
| holt_winters | 12.7 | +0.8 |
| naive | 67.6 | −42.8 |

### The better model lost the decision

Holt-Winters is clearly the better *daily* model — it tracks the monthly rent
and EMI spike that a flat line cannot, and beats seasonal-naive by 21%.

But runway does not ask what Tuesday costs. It asks for a 90-day **total**,
and on that a flat mean is roughly twice as accurate. The smoothing model's
trend term extrapolates, and that error accumulates across all ninety days;
a mean stays unbiased over a long sum.

So the decision is split, and both halves are honest:

- **the runway number** comes from the mean — 6.4% error, +1.7% bias
- **the depletion curve** is drawn by Holt-Winters, because it has the monthly
  shape the user needs to see

Picking the model that wins a metric the product does not use is precisely
the mistake this harness exists to catch.

### Conformal intervals: 0.909 against a nominal 0.90

Distribution-free, and calibrated only on windows *earlier* than the one being
scored — calibrating on all windows would leak the answer into its own
interval.

The first attempt came out at **0.814**, badly under-covered. The cause was
using the plain empirical quantile instead of the finite-sample conformal
quantile `ceil((n+1)(1−α))/n`; with few calibration windows the plain version
sits systematically too low. One-line fix, 0.814 → 0.909.

Under-covering is the dangerous direction: it tells a user their runway is
more certain than it is.

### A gate that lied, and got fixed

The first version of this script printed *"intervals too narrow, must not
ship"* — and then shipped, because the gate only looked at MASE. Accuracy and
calibration are separate questions and a point forecast with a wrong
uncertainty band is worse than one with no band, because the band gets
believed. The gate now blocks on coverage as well.

### Caveat on the data

The generator uses exact 30-day months, so a seasonal period of 30 is exactly
right here. Real calendars are 28–31 days and the cycle drifts against any
fixed period, which is meaningfully harder. Treat the seasonal component as
optimistic; the level and trend results are unaffected.

---

## M2 · Recurring Payment Detector — not shipped

Finds subscriptions and EMIs by periodicity alone. Fully unsupervised, so it
works on a new user's first import — exactly where M1 is weakest. Merchant
fingerprinting, then FFT autocorrelation over a daily event series, then a
robust score from median/MAD gap and amount statistics.

Five seeds, against a "seen ≥ 6 times" frequency baseline:

| | precision | recall | F1 |
|---|---|---|---|
| baseline — frequency only | 0.121 | 0.239 | 0.158 |
| **M2** | **0.700** | 0.136 | 0.221 |

Period estimation is genuinely good: **0.9 days off a 30.4-day cycle**.

Sensitivity to the occurrence bar, reported in full rather than at its best
setting — picking the winner after seeing the scores is how you tune on your
test set:

```
min_occ   precision   recall     F1   detections
      4       0.660    0.255  0.367          5.0
      5       0.700    0.176  0.277          3.0
      6       0.700    0.136  0.221          2.2
      8       0.700    0.121  0.198          1.8
```

### The verdict is: do not ship this as an auto-cancel feature

Precision plateaus at 0.70. One recommendation in three would be wrong, and
this feature's job is to tell somebody to cancel something — a false positive
here says *cancel your rent*. Recall of 0.14–0.26 means it also misses most
real subscriptions. Neither number is close to good enough.

It **is** useful as a surfacing tool where a human confirms: "these look
recurring, is that right?" At 0.70 precision with a person as the gate, that
ships. Auto-cancellation does not. The default `min_occurrences=6` is set for
precision because of that asymmetry.

### The blocker is merchant resolution, not the algorithm

54 of 80 merchants still fragment across multiple groups, and a monthly series
split into four pieces has too few points left to show a period. That is where
the recall is going.

No further string heuristic will fix it. `SWIGGY` and `BUNDL TECHNOLOGIES` —
its registered entity, and what actually prints on the statement — share no
characters at all. That mapping is knowledge about the world, not a property
of the string. Production systems buy it as a merchant directory, and that is
the honest next step.

### Three things that were wrong, and one idea that failed

| | effect |
|---|---|
| ACF took the global max, which is often a **harmonic** | Netflix, a clean 30-day subscription, was reported as 90-day quarterly. Scanning for the first strong peak fixed it — the same bug makes pitch detectors hear a note an octave low. |
| `acf_strength` was computed and **never used** | A salary landing on random days scored 0.72 confidence as an "annual" series. Peak height *is* the evidence a period exists; white noise has none. |
| `min_occurrences` was 3 | Any three dates fit some period exactly. Three points are not evidence of a cycle. |

And one hypothesis that did not survive contact: grouping by **amount first**
rather than name. Correct in spirit — a subscription's defining property is
its fixed price — and much worse in practice. It shattered variable-amount
merchants into dozens of three-transaction clusters and precision fell from
0.472 to **0.184**.

The lesson generalised into the fix: amount is the right **filter** and the
wrong **key**. It is now a hard gate — a series whose amount swings more than
22% is a place somebody shops, not a standing commitment, however regularly
they visit. That single change took precision from 0.18 to 0.70 and cut false
positives across all seeds from 47 to 2.

---

## The golden test

`internal/engine/runway_golden_test.go` is the reason the port is safe to
ship. `testdata/golden.json` is generated by bundling the **real frontend
engine** and running it over the **real seed profile**:

```bash
npx esbuild internal/engine/testdata/golden.ts --bundle --platform=node     --format=esm --outfile=/tmp/golden.mjs && node /tmp/golden.mjs     > internal/engine/testdata/golden.json
```

The Go implementation must then reproduce every figure to within two paise.
A rewrite that merely "looks right" is how a finance app quietly starts
showing different numbers on two screens; this makes that a build failure
instead of a support ticket.

Regenerate the fixture whenever the TypeScript engine changes. A diff in
`golden.json` is a deliberate decision, never an accident.

A third test demonstrates why every amount here is `int64` paise:

```
float64 drift after 1000 additions of 0.10: 99.99999999999859312538 vs 100.0
```

---

## Layout

```
backend/
├── docker-compose.yml        Timescale · Valkey · Redpanda · MLflow
├── db/migrations/
│   ├── 001_init.sql          users, profile, debts, goals, holdings, lots
│   ├── 002_timeseries.sql    transactions, prices, score_history (hypertables)
│   └── 003_ml.sql            model_versions, predictions, recurring_series
├── go-api/
│   ├── cmd/server/main.go    wiring, graceful shutdown
│   └── internal/
│       ├── auth/             argon2id + JWT  (11 tests)
│       ├── config/           env-driven, fails fast on a missing secret
│       ├── engine/           runway + freedom, ported  (golden tests)
│       ├── rpc/              HTTP handlers, middleware
│       └── store/            pgx pool, users, sessions
└── ml/
    ├── requirements.txt
    ├── artifacts/            trained weights + metrics
    └── salarypilot_ml/
        ├── data/synth.py     synthetic Indian narration corpus
        ├── models/
        │   ├── vectorize.py  char n-gram TF-IDF, from scratch
        │   └── softmax.py    multinomial logistic regression, from scratch
        ├── evaluate/metrics.py   macro-F1, ECE, reliability, baselines
        └── train/m1_categoriser.py
```

---

## Two conventions worth knowing before you read the code

**Money is BIGINT paise, never a float.** Binary floating point cannot
represent 0.1 exactly. A rounding drift in a finance app compounds silently
for months and is the one class of bug users never forgive.

**Every model ships with the baseline it beat.** A metric without the bar it
cleared is not evidence. `majority_baseline()` runs on every training run and
the result is stored next to the model in `model_versions.metrics`. A model
that does not clear its baseline gets cut, not tuned into looking good.

---

## Data honesty

There are no real bank statements here and there should not be. The training
corpus is generated from the narration *grammars* Indian banks actually emit —
UPI, NEFT, NACH, POS and ATM formats — populated with real merchant names,
their registered legal entities (`BUNDL TECHNOLOGIES` for Swiggy), payment
aggregator prefixes, field-width truncation and vowel-dropping abbreviation.

The hard parts of the real problem are preserved rather than smoothed away.
The easy parts are not. Treat the seen-merchant number as optimistic and the
unseen-merchant number as the one that predicts production.

If real anonymised statements ever become available, only `data/synth.py` is
replaced.
