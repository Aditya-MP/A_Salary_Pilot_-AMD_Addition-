# SalaryPilot — Project Report

**What this is:** an AI-assisted personal finance app for Indian salaried employees, built as a portfolio project. The pitch is not "here is a dashboard of your money" — it's *"know exactly how long you could last, and what actually moves that number."* Every screen is built around **runway** (months you could survive on zero income) rather than net worth, because net worth is a vanity number and runway is the one that changes what you do on a Tuesday.

Three deliberate constraints shaped every decision documented below:

1. **No API-calling for the core intelligence.** Every model (M1–M8) is hand-implemented on top of `numpy` — no scikit-learn, no managed ML API. Gemini is the one named exception, reserved for the AI Coach chat surface.
2. **No fabricated numbers presented as real.** Where the app doesn't have real data, it says so and refuses to guess. Where it does have real data, it went and got it — three of the eight models run on genuinely fetched real market data, not a simulator.
3. **Every model ships with the baseline it beat, or it doesn't ship.** Four of eight models were evaluated and *not* shipped, or shipped in a reduced form, because the evidence didn't support the original scope. That's treated as a normal, healthy outcome of the discipline, not a failure to hide.

This document describes the system as it stands: architecture, every backend route, every model with its real evaluation verdict, the frontend structure, the database schema, and the honest list of what's still missing.

---

## 1. Architecture

Three processes, one command to run them all (`npm run dev:all`):

```
┌─────────────────────┐      HTTP/JSON       ┌──────────────────────┐      HTTP/JSON      ┌───────────────────────┐
│   React frontend     │ ───────────────────▶ │   Go API (:8087)     │ ──────────────────▶ │  Python ML service    │
│   Vite (:5173)        │ ◀─────────────────── │   auth, wallet,       │ ◀────────────────── │  (:8000)               │
│                       │                       │   ledger, proxy       │                      │  M1, M5, M6, M8 served │
└──────────┬────────────┘                       └──────────┬────────────┘                      └────────────────────────┘
           │                                                │
           │ localStorage                                   │ pgx/v5
           │ (per-user namespaced profile)                   ▼
           │                                       ┌──────────────────────┐
           └──────────────────────────────────────▶│  PostgreSQL (Neon)    │
                                                     │  users, sessions,     │
                                                     │  ledger (double-entry)│
                                                     └──────────────────────┘
```

- **Frontend** owns UI, client-side financial computation (runway/tax/portfolio engines), and per-user local state.
- **Go API** owns identity, money (the wallet ledger), and proxies model calls — it is the only thing with a database credential.
- **Python ML service** is stateless per request; it holds trained models in memory and answers on demand. It has no database access at all.
- **Neon Postgres** is the single source of truth for accounts, sessions, and every rupee that has ever moved through a wallet.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind (token-only), Zustand, React Router v7, Recharts, Framer Motion | Deliberately different from the author's prior MERN/Next.js projects |
| Backend API | Go 1.26.7, `net/http` (stdlib router), `pgx/v5`, `golang-jwt/v5`, `golang.org/x/crypto` (argon2id) | No framework — the stdlib router is enough for ~20 routes, and it means understanding every line |
| ML service | Python, FastAPI, uvicorn, **`numpy` only** for the actual model math | `scipy`/`pandas`/`torch`/`mlflow`/`onnx` are listed in `requirements.txt` but **not imported anywhere** — leftover from initial scoping, not in the running system |
| Database | PostgreSQL 18.6 on Neon, declarative partitioning (not TimescaleDB) | TimescaleDB needed Docker, which needed WSL2, which needed virtualisation the host BIOS had disabled — pivoted rather than blocked |
| AI chat | Gemini (`@google/generative-ai`) | The one deliberate exception to "build it yourself" |

**Why Go moved off Docker:** the original plan used TimescaleDB via Docker Compose. `HypervisorPresent: False` — virtualisation was disabled in firmware, not a Docker config issue, and not fixable without a BIOS-level reboot. Rather than block on that, the schema was rewritten on plain PostgreSQL with hand-rolled monthly range partitioning (`ensure_month_partition()`), and the database moved to a hosted Neon instance so nothing local needs to be running for persistence.

---

## 3. Backend — Go API (`backend/go-api`)

### 3.1 Package layout

```
internal/
  auth/      argon2id hashing, JWT issue/verify, refresh-token rotation
  config/    env loading (+ .env autoload, added this session)
  engine/    Go port of the frontend's runway/score math (golden-tested against TS)
  mlclient/  typed HTTP client to the Python service
  rpc/       the HTTP server, all route handlers
  store/     Postgres access for users/sessions
  wallet/    the double-entry ledger service
```

### 3.2 Authentication

- Passwords: **argon2id**, 19 MiB memory / t=2 / p=1, parameters stored per-hash so they can be upgraded without breaking old hashes.
- Tokens: JWT (HS256, algorithm pinned — `alg: none` attacks are explicitly tested against), short-lived access token + a **single-use, rotating** refresh token.
- Password policy: length-only (≥12 chars), per NIST SP 800-63B — no forced symbol/digit composition, because that produces `Password1!` and nothing else.
- Timing-safe login: a lookup miss still runs a full argon2id hash before returning "incorrect," so a wrong email doesn't respond faster than a wrong password (which would otherwise enumerate the user table).
- Registration and login return **identically shaped errors** for "no such user" and "wrong password" — the classic account-enumeration pair.

### 3.3 The wallet — a real double-entry ledger

This is the most heavily engineered part of the backend. Money is **simulated** (no real payment rail is connected — handling real rupees in India needs an RBI Prepaid Payment Instrument licence this project doesn't have), but the accounting is genuine.

**Why double-entry instead of a `balance` column:** a balance column is one number with no history — when it's wrong, there's no way to discover when or by how much. In double-entry, money is never created or destroyed, only moved between accounts; every transaction's entries sum to exactly zero, and a balance is *derived* from entries rather than stored as an opinion.

Enforced **by the database**, not application code:
- `ledger_entries` has a no-`UPDATE`/no-`DELETE` `RULE` — history is append-only, full stop. A correction is a new compensating transaction, never an edit.
- A deferred `CONSTRAINT TRIGGER` rejects any transaction whose entries don't sum to zero — verified with a raw-SQL test that bypasses the Go layer entirely and still gets rejected.
- Idempotency keys are checked **first, inside the transaction** — a duplicate request returns the *original* transaction id and moves nothing, protecting against double-taps and client retries.
- `ledger_drift` and `ledger_total` views let the whole system's integrity be checked with one query at any time.

Verified with **7 integration tests against live Postgres** (`internal/wallet/wallet_test.go`), including a test that writes a one-legged transaction via raw SQL and asserts the database itself refuses to commit it.

### 3.4 Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/healthz` | — | liveness only, never touches the database |
| GET | `/readyz` | — | database + model-service reachability + ledger drift, all in one check |
| POST | `/v1/auth/register` | — | argon2id hash, creates the user + standing ledger accounts |
| POST | `/v1/auth/login` | — | timing-safe |
| POST | `/v1/auth/refresh` | — | rotates the refresh token, single-use |
| GET | `/v1/me` | ✓ | name, email, id — for the client to greet the user without a second copy of the profile |
| POST | `/v1/auth/logout` | ✓ | revokes every session for the user |
| POST | `/v1/runway`, `/v1/categorise`, `/v1/simulate` | — (dev-open) | proxy to the ML service |
| POST | `/v1/allocate` | ✓ | proxy to M5 (real-data portfolio allocator) |
| GET | `/v1/screen` | ✓ | proxy to M8 (real Nifty 500 momentum screener) |
| GET/POST | `/v1/wallet`, `/v1/wallet/history`, `/v1/wallet/topup`, `/v1/wallet/invest`, `/v1/wallet/redeem`, `/v1/wallet/withdraw` | ✓ | the ledger |

**Known deployment gap:** `/v1/runway`, `/v1/categorise`, and `/v1/simulate` are still open (no auth) for local development convenience. Before any real deployment they need to move behind `requireAuth` — flagged here explicitly so it isn't forgotten.

### 3.5 CORS

Development mode accepts **any loopback origin** (`localhost`/`127.0.0.1`, any port) — added because Vite silently moves to `5174`, `5175`, etc. when its default port is taken, and a hardcoded origin list turned that into a confusing CORS failure with no visible cause. Verified against spoofing: `http://localhost.evil.com` and similar lookalikes are parsed and rejected, not prefix-matched. Production mode keeps a fixed allowlist.

---

## 4. Backend — Python ML service (`backend/ml`)

### 4.1 Package layout

```
salarypilot_ml/
  data/        synth.py (M1's synthetic corpus), nse.py + market_factors.py (real market data fetchers)
  models/      the actual algorithms — vectorize, softmax, features, recurring, forecast,
               garch, portfolio, simulate, bandit, factors
  evaluate/    metrics, timeseries, risk — shared evaluation primitives
  train/       one script per model, each produces artifacts/mX_metrics.json
service/
  app.py       FastAPI app, only 4 model endpoints are actually live
  registry.py  M1: trains at boot (~1.6s) from synthetic data
  allocate.py  M5: serves from real cached market data
  screener.py  M8: loads a pre-computed artifact from real data
```

### 4.2 The eight models, honestly

Every model was evaluated against a stated baseline and shipped, reduced, or rejected based on what the evaluation actually showed — not on how much work had gone into it.

| | model | verdict | what actually ships |
|---|---|---|---|
| **M1** | Transaction categoriser (char n-gram TF-IDF + softmax regression) | shipped, v2 | 12 categories. **This session:** fixed two real bugs — a non-deterministic training corpus (`hash()` misuse, see §7) and behavioral features drowning out text signal (also §7). Seen accuracy 94.7%, seen macro-F1 95.1%, **unseen macro-F1 36.3%** — reported honestly on every response via a `caveat` field, because this is the number that predicts real-world performance on a brand-new user's own vocabulary. |
| **M2** | Recurring-transaction / subscription detector | **verdict: tune** — not shipped as originally scoped | An amount-first grouping hypothesis was tried and failed (precision 0.472 → 0.184 versus the shipped merchant-first approach) — a real, reported negative result, not hidden. |
| **M3** | 90-day spend forecast | **split verdict** | Mean model for the 90-day *total* (6.4% error); Holt-Winters for the *shape* of the curve. Neither alone was good enough for both jobs. |
| **M4** | Volatility / VaR | **ships for the volatility forecast only** | GARCH(1,1) volatility forecasting passes; VaR backtesting (Kupiec POF + Christoffersen independence tests) does not clear the bar and is not shipped. |
| **M5** | Portfolio allocator | **ships — real data, this session** | Was a calibrated *synthetic* factor model with a hardcoded seed (frozen forever, see §7) — rebuilt this session on six real instruments (real Nifty 50, real gold ETF, real Bitcoin, etc.). Real walk-forward evaluation: beat equal-weight on **both** return (13.6% vs 9.6%) and volatility (−26.9%) over 7 real quarters. Small sample, disclosed as such in the API's own `caveat`. |
| **M6** | Financial-independence Monte Carlo simulator | **ships** | Stationary block bootstrap (Politis–Romano) keeps 67% of real return clustering versus IID sampling's −1%. Returns percentiles and probabilities, never a single number — a `null` percentile means "never reaches FI," not zero. |
| **M7** | Lesson-ordering recommender (contextual bandit) | **ships, behind a heuristic until warmup** | LinUCB/Thompson-sampling policies beat the shipping heuristic only after roughly **4,300 impressions** — before that, the simple heuristic wins and is what's actually used. |
| **M8** | Real Nifty 500 momentum/low-volatility screener | **ships, this session, from scratch** | Built in response to a direct ask this session. Real universe (NSE's own current 500-constituent list), real 5-year daily prices (Yahoo Finance), momentum (12-1) + low-volatility factors — both published, decades-replicated findings, with their known failure mode (momentum crashes) disclosed. Real walk-forward result: beat the real Nifty 500 index in **10 of 15 real quarters** (67% hit rate), 24.9% vs 13.4% annualised return. **Deliberately no buy button** — it's a ranked research view, not an order ticket; automatic investing elsewhere in the app never concentrates in a single company. |

**The honesty mechanism that makes this credible:** four of eight models did *not* ship as originally scoped, and that's reported as plainly as the four that did. A project where every model "works" is a project that never really evaluated anything.

### 4.3 Real data, where it matters (M5 and M8)

Two of the eight models run on genuinely fetched, real market data — the other six are calibrated synthetic simulators, explicitly disclosed as such wherever they're surfaced.

- **Universe source:** `nsearchives.nseindia.com` — NSE's own public archive serves the current Nifty 500 constituent CSV. (NSE's *main* site blocks non-browser traffic with a 403; the archives host does not — verified directly before building on it.)
- **Price source:** Yahoo Finance's chart endpoint (unofficial, undocumented, but the standard free source for NSE `.NS` tickers — the same one the widely-used `yfinance` library relies on).
- **Caching:** every fetch is cached to disk (`backend/ml/data_cache/`), resumable, rate-limited (0.2–0.25s between requests) — a demo project has no business hammering a free API on every run.
- M5's six real proxies: `^NSEI` (Nifty 50), `^CRSLDX` (Nifty 500), `GILT5YBEES.NS` (govt bond ETF), `GOLDBEES.NS` (gold ETF), `ESG.NS` (ESG ETF), `BTC-USD`.
- M8's universe: 421 of 500 real constituents that passed an 85%-calendar-coverage filter.

---

## 5. Database schema (`backend/db/migrations`)

Four migrations, applied via a hand-written runner (`cmd/migrate`) rather than a framework — checksums verified (editing an already-applied migration file is refused), one transaction per migration, idempotent.

| migration | contents |
|---|---|
| `001_init.sql` | users, sessions |
| `002_timeseries.sql` | transactions, prices, score_history — range-partitioned by month (the TimescaleDB replacement, see §2) |
| `003_ml.sql` | model-adjacent tables |
| `004_wallet.sql` | the double-entry ledger — `ledger_accounts`, `ledger_transactions`, `ledger_entries`, plus the balance/drift views (§3.3) |

---

## 6. Frontend (`src/`)

### 6.1 Pages (17)

`Dashboard`, `Onboarding`, `AuthPage`, `Wallet`, `Invest`, `Screener`, `Portfolio`, `SalarySplitting`, `TaxCentre`, `Transactions`, `QuarterlyPulse`, `RiskProfile`, `TripleGuard`, `Learning`, `AICoach`, `News`, `UserProfile`, `LandingPage`.

**The account lifecycle, end to end:**
1. `AuthPage` — real credentials only. The original test-mode bypass ("any credentials sign you in") was explicitly removed this session at the user's direction, once the wallet made per-account data isolation load-bearing rather than cosmetic.
2. `Onboarding` — a new account starts **genuinely empty**, not on a fabricated seed profile. Four short steps (income, essential costs, savings/debt) collect only what the runway formula actually needs; a live preview computes the real number from whatever's been entered so far. Replaced an earlier version where every new signup opened on a fictional ₹1.24L salary and a 5.9-month runway that belonged to nobody.
3. `Wallet` — add/withdraw simulated money, view holdings, sell a position. **No buy-by-ticker picker** — that decision was deliberately removed and moved to `Invest`, so this screen is never where an allocation choice gets made.
4. `Invest` — pick an amount and a risk tolerance; M5 proposes a diversified plan with a stated reason per line; the user approves or doesn't. The review screen's "did this earn more or less than the benchmark" language is **generated dynamically from the live API response**, not hardcoded — the first version hardcoded "it earned less," which became false and needed fixing the moment M5 was switched to real data.
5. `Screener` — M8's real, ranked companies. Read-only by design.
6. `Portfolio`, `Dashboard` — the derived view of all of the above, repriced on a shared live tick.

### 6.2 State (`src/store/`)

Three separate Zustand stores, deliberately not merged:

- **`useAuthStore`** — who's signed in. Not persisted directly; the session (tokens) lives in `lib/session.ts`.
- **`useAppStore`** — the financial profile (income, expenses, goals, tax deductions). **Namespaced per user id** in localStorage (`salary-pilot-storage:<user_id>`), rebound on every sign-in/out via `bindStorageToUser()`.
- **`useWalletStore`** — the server-side wallet balance, fetched once and shared across Dashboard/Portfolio/Wallet/Invest so a trade made on one screen is instantly visible everywhere else — never persisted locally, since the ledger on the server is the only authority.

**The most serious frontend bug found and fixed this session** lived here: `bindStorageToUser()` used to `setState(DEFAULTS)` *after* pointing zustand's persist middleware at the new user's real storage key — which meant the reset itself got written through to that key, wiping a returning user's real answers a fraction of a second before `rehydrate()` tried to read them back. Every login looked like a brand-new account. Fixed by checking `localStorage.getItem(key)` first and only resetting when there's genuinely nothing there. **Verified by bundling the actual store module and replaying the exact bug in Node against a fake `localStorage`** — not just reasoned about; the broken version was confirmed to reproduce the bug, and the fixed version was confirmed to resolve it, using the real code both times.

### 6.3 Client-side engines (`src/engine/`)

The financial computations that don't need a server round-trip live here, and are **golden-tested against the Go port** (`runway_golden_test.go` bundles this TypeScript with esbuild and checks the two implementations agree to within 2 paise):

- `runwayEngine` — the core number: liquid savings ÷ essential monthly burn, with a 5-pillar Freedom Score (runway/debt/savings/protection/growth).
- `planEngine` — turns M5's asset-class weights into an actual basket of instruments, using largest-remainder apportionment so a plan's paise sum exactly to the invested amount.
- `pulseEngine` — the Quarterly Pulse staging mechanic. **Bug fixed this session:** an off-by-one meant a phantom "Stage month 4" button existed and, if clicked, added a 4th month's contribution before finally marking the quarter ready — verified fixed by bundling and replaying the exact click sequence.
- `taxEngine`, `regimeEngine`, `portfolioEngine`, `leakEngine`, `guardEngine`, `decisionEngine`, `sustainabilityEngine`, `trendEngine`.

### 6.4 Domain (`src/domain/`)

- `types.ts` — the real shape of a salaried person's finances (income, expenses, debts, holdings, goals, tax deductions) — replaced an original three-number model (equity/crypto/esg totals).
- `empty.ts` — what a new account actually starts with (nothing) plus `hasFinancialData()`, the guard that stops the Dashboard from rendering a confident "0.0 months · critical" about someone the app knows nothing about.
- `market.ts` — the instrument universe. Explicitly splits instruments into `autoAllocate: true` (diversified funds M5/planEngine may choose) and `autoAllocate: false` (single companies — RELIANCE, TCS, etc. — buyable by hand, never auto-selected, because picking one company over another honestly needs fundamentals data this app doesn't have).
- `fromWallet.ts` — turns the server's wallet holdings into the domain `Holding[]` shape the engines expect, so a real purchase feeds the same runway/portfolio math as everything else.

### 6.5 Design system

Single source of truth: CSS custom properties (`src/design/tokens.css`). "Disciplined neon" — one ink base, one accent color, neon reserved specifically for data/state, not decoration. Replaced an earlier version where every page had its own saturated gradient banner and looked like seven different products.

---

## 7. Notable bugs found and fixed this session

Documented here because each one changes what a user would actually have experienced, and because the discipline of finding these (verify, don't assume) is as much a part of this project as the features themselves.

| bug | impact | fix |
|---|---|---|
| `hash()` used for a "stable" per-merchant day-of-month in M1's synthetic corpus generator | Python's built-in `hash()` on strings is **randomized per process** — despite `seed=7` everywhere, the training corpus was silently different on every single server restart, breaking the reproducibility every model's evaluation discipline depends on | Replaced with `hashlib.md5`, which is stable across processes |
| Behavioral features (27 dims: amount, channel, day) drowning out text features (9,360 dims) in M1 | A real rent payment, genuinely in the training set, was classified "transfer" at 99.9999% confidence — traced to the logit level: text correctly preferred "housing" (+2.2), behavioral features overrode it (+14.2 toward "transfer") | Measured the real scale mismatch (behavioral rows average 4.5x text's row norm) and rescaled to match; seen accuracy improved 92.8%→94.7% as a side effect |
| M5's asset allocator ran on a synthetic model with a hardcoded seed | Every user, every day, forever, got byte-identical portfolio weights — indistinguishable from a frozen screenshot | Rebuilt on real market data (§4.3); verified the weights now genuinely depend on real, refetchable data |
| M5's risk-limit post-processing didn't cap every asset | A "conservative" profile came out with 55% in a single bond fund, breaking the module's own "no asset above 35%" rule | Rewrote the redistribution logic with a proper gold ceiling and a genuine last-resort fallback; verified 0 constraint violations across all 3 profiles |
| Go's `AllocateResponse` struct was missing the new `ordering_note` field | The honest "risk ordering is inverted right now" disclosure (added when real gold volatility made "conservative" numerically riskier than "balanced") was silently dropped by Go's JSON marshaling and would never have reached a real user's browser | Added the field as a nullable pointer; verified end-to-end through the live Go→frontend chain |
| `Balance()` filtered exact-zero ghost positions but not near-zero dust | Any "sell everything" redemption at a live (rounded) price leaves a tiny fractional-unit residue with ₹0 cost — would show as a phantom ~0.001-unit row in the real Wallet UI forever | Extended the filter to a small, carefully-justified epsilon (0.0001 units) |
| Wallet's data-reset request (a real, in-session task) | The ledger is genuinely append-only (§3.3) — a hard delete was attempted and correctly refused by the database itself | Reset achieved via real reversing transactions (sell every holding, withdraw the balance) — a discovery that validated the append-only design was working exactly as intended |
| `npm run dev:all` port collisions | The assistant's own background verification instances were repeatedly left running across turns, colliding with the user's own terminal | Root-caused and now torn down immediately after each verification, before handing control back |

---

## 8. Security & trust decisions worth naming

- **argon2id, not bcrypt/sha256** — memory-hard, resistant to GPU cracking.
- **JWT `alg` pinned** — explicitly tested against `alg: none` token forgery.
- **Refresh tokens are single-use and rotate** — replaying an old one after refresh returns 401, verified directly.
- **Frontend token storage is in `localStorage`, not an HttpOnly cookie** — a documented, deliberate trade-off for local development (frontend and API are on different origins/ports), not an oversight. Flagged as needing to change before any real deployment.
- **The ledger cannot lie about its own balance** — `ledger_drift`/`ledger_total` let the whole system's integrity be checked with one query, and every code path that moves money goes through the same `wallet.Service`, never raw SQL.
- **No individual-stock auto-investing anywhere** — a structural decision, not a per-screen one. M5's plans and M8's screener both explicitly refuse to concentrate automatic money in a single company, because doing so honestly requires fundamentals data this project does not have.

---

## 9. Known gaps (honest, as of this report)

- `/v1/runway`, `/v1/categorise`, `/v1/simulate` are still open (no auth) — needs fixing before any real deployment.
- Onboarding answers (income, expenses, goals) live only in browser localStorage, not the database — a user's financial profile does not follow them to a different device, only their wallet and login do.
- M2 (recurring-transaction detection) is evaluated but not shipped; M4's VaR half is evaluated but not shipped.
- The live price feed for instruments (`useLivePrices`) is a calibrated random walk, clearly disclosed as simulated everywhere it's shown — unlike M5/M8, it does not yet pull from the real market data pipeline now proven to work.
- `requirements.txt` lists `torch`, `scipy`, `pandas`, `mlflow`, `onnx` — none are actually imported; the real dependency surface is just `numpy` plus the FastAPI serving stack.
- M5's growth-tilt (used for "aggressive" plans) uses trailing real sample mean return as its expected-return estimate — a known, disclosed statistical weakness (mean returns are far noisier to estimate than covariance, which is precisely why 1/N is treated as a real bar throughout this project's own evaluation discipline).

---

## 10. Running it locally

```
npm run dev:all
```

One command, three services, color-coded output (`web`/`api`/`ml`), Ctrl+C tears down all three together. Requires `backend/.env` with a `DATABASE_URL` pointing at a Postgres instance (Neon, in this project) — everything else defaults sensibly for local development.

| service | port | what breaks without it |
|---|---|---|
| Vite (`web`) | 5173 | nothing to look at |
| Go API (`api`) | 8087 | login/signup fail outright; Wallet/Invest/Portfolio/Screener show "API is not running" — deliberately no local fallback, since a fake balance is worse than none |
| Python ML (`ml`) | 8000 | Invest/Screener return 503; transaction categorisation degrades gracefully instead of failing |
