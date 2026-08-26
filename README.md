# SalaryPilot

**Know exactly how long you could last.**

> AMD Pervasive AI Developer Contest (Slingshot) submission.

Most personal-finance apps answer *"what do I own?"* — a number that moves on its
own and that the user can rarely influence. SalaryPilot answers the question
salaried people are actually carrying around: **if the income stopped today, how
long before I'm in trouble — and what would genuinely change that?**

---

## The two numbers the product is built on

### Runway

How many months you survive with zero income, measured against **essential**
spending only — rent, food, EMIs, family support — because discretionary
spending stops on day one of a crisis.

Liquidity is graded rather than assumed. Money inside a three-year ELSS lock-in
is not a buffer, and the app refuses to pretend otherwise. Assets are also
haircut for the fact that a forced sale usually happens in a downturn: equity at
85%, crypto at 70%, retirement instruments at zero.

The dashboard chart deliberately slopes **down** to zero and labels the month the
money runs out. Every other chart in every finance app slopes up and to the
right.

### Freedom Score

A 0–100 composite of five pillars, each shown with its own score and a
plain-English verdict — never a black box:

| Pillar | Weight | What it measures |
|---|---|---|
| Safety runway | 30 | Months of cover vs. a target scaled by dependents |
| Debt drag | 20 | Debt weighted by **rate**, not balance, and net of deductibility |
| Savings rate | 20 | Surplus as a share of in-hand, full marks at 30% |
| Protection | 15 | Term cover vs. 10× income; health cover vs. family need |
| Freedom progress | 15 | Net worth against 25× annual essential spend |

---

## What makes it different

**Levers, not advice.** Every suggested action is simulated against the user's own
numbers and ranked by its actual effect on runway. A ₹2,000 SIP increase adds
*zero* runway; ₹2,000 into a liquid fund adds real weeks. Most apps blur that
distinction and it is the single most useful thing the product can say.
Applying a lever mutates the real profile, so the score visibly moves.

**Leak Hunter.** Finance apps are excellent at showing what you own and useless at
showing what you're losing. Dead subscriptions, a card revolving at 42%, idle
cash earning 3% while a 14% loan runs, unclaimed deductions — all priced as an
annual figure, because "₹210 a month" feels free and "₹2,520 a year" does not.

**Tax Centre.** Tax is the largest expense of a salaried life and every other app
treats it as a footnote. This runs both regimes against real declarations,
reports the break-even deduction level that would flip the answer, shows which of
the three statutory HRA limits is binding, and tracks deduction headroom against
the 31 March deadline.

**Portfolio that shows what you keep.** After-tax proceeds per position, LTCG/STCG
classification with days-to-threshold, allocation drift with rupee rebalancing
amounts, a concentration index, a liquidity ladder, and tax-loss harvesting
opportunities.

**Learning Hub ordered by what you're getting wrong.** Fourteen lessons sorted by
the user's weakest Freedom Score pillar, not by difficulty. Someone bleeding 42%
on a credit card sees the debt lesson first, not "Introduction to Compound
Interest". Each lesson names the specific mistake it prevents.

---

## AI Coach — six agents

Each agent watches one part of the balance sheet and **shows its reasoning**, so
the advice can be argued with rather than just believed.

| Agent | Watches |
|---|---|
| **Runway Guard** | Liquid assets vs. essential burn |
| **Debt Strategist** | Payoff order by rate and after-tax cost |
| **Tax Optimiser** | Regime choice, deduction headroom, harvestable losses |
| **Leak Hunter** | Subscriptions, interest, idle cash, insurance gaps |
| **Portfolio Doctor** | Allocation drift, concentration, LTCG timing |
| **Milestone Planner** | Goals against deadlines, freedom horizon |

The earlier line-up was reviewed rather than kept by default. *Market Rules
Agent* was cut — summarising SEBI circulars is news, not coaching, and it now
lives on the News page. The three surviving agents were rewritten because each
previously held a fixed array of three strings that would have been identical for
every user on the platform. A hardcoded "18–22% CAGR" projection was removed:
asserting a return with no basis destroys trust, and in India it would not
survive SEBI scrutiny either.

---

## Design

A **disciplined neon** system: one deep ink base, one primary accent, and neon
reserved strictly for data and state — gains, losses, alerts. Nothing decorative
glows.

- All colour lives in `src/design/tokens.css` as custom properties. Tailwind
  only exposes those tokens, so there is exactly one source of truth.
- Every page opens with the same quiet `PageHeader`, replacing seven
  full-bleed saturated gradient banners that made the screens look like seven
  different products.
- All numbers are set in a monospaced tabular face so digits don't jitter as
  live prices tick.
- One easing family, three durations. Route transitions are a 10px rise over
  260ms — enough to make the relationship between screens legible, restrained
  enough to survive the fiftieth navigation of a session.
- `prefers-reduced-motion` is honoured throughout.

---

## Architecture

```
src/
├── design/tokens.css       Single source of truth for colour, motion, spacing
├── domain/
│   ├── types.ts            The real shape of a salaried person's finances
│   ├── seed.ts             A deliberately imperfect demo profile
│   └── curriculum.ts       14 lessons, tagged to Freedom Score pillars
├── engine/
│   ├── runwayEngine.ts     Runway, Freedom Score, ranked levers
│   ├── portfolioEngine.ts  After-tax value, drift, concentration, harvesting
│   ├── regimeEngine.ts     Old vs new regime, HRA, deduction headroom
│   ├── leakEngine.ts       Leak detection, payday plan
│   ├── agents.ts           The six AI Coach agents
│   ├── guardEngine.ts      Triple Guard behavioural checks
│   └── pulseEngine.ts      Quarterly staging
├── hooks/
│   ├── useFinancials.ts    Derives the whole picture once, memoised
│   └── useLivePrices.ts    One shared ticker for the entire app
├── components/
│   ├── primitives/         Card, PageHeader, Stat, Meter, Badge, Segmented
│   ├── motion/             PageTransition, Reveal, AnimatedNumber
│   └── charts/             Shared Recharts theme, inline Sparkline
└── pages/
```

Every screen derives from **one** `FinancialProfile`, so no two pages can
disagree about the user's own numbers.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

Sign-in is a **test harness**: any credentials sign you in. Premium is a toggle
that costs nothing.

Optional — for the AI Coach's live model insight:

```env
VITE_GEMINI_API_KEY=your_key
```

Everything else is local computation and works without it.

---

## Tech

React 19 · TypeScript · Vite · Tailwind (tokens only) · Zustand (persisted) ·
React Router v7 · Recharts · Framer Motion · Lucide

---

## Honest limitations

- **Prices are simulated**, not a live market feed — a shared random walk with a
  common market factor and per-asset-class volatility, so holdings move together
  the way real ones do.
- **News headlines are representative samples.** The rupee impact beside each one
  is computed from real holdings and the live feed; wiring in a news API would
  only change the left-hand column.
- **Tax rates are the FY 2025-26 structure**, held in `regimeEngine.ts`. If slabs
  change, that is the only file to edit.
- **Not investment advice.** No returns are asserted anywhere in the product.

---

**Aditya MP** · [@Aditya-MP](https://github.com/Aditya-MP)
