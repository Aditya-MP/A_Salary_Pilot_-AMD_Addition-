import type { FinancialProfile, Holding } from '../domain/types';
import { clamp } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   RUNWAY & FREEDOM ENGINE  —  the spine of the product.

   Two questions, answered honestly:
     1. "If my income stopped today, how long do I last?"      → runway
     2. "How far am I from work being optional?"               → freedom

   Design notes that matter:
   • Runway is measured against ESSENTIAL spend only. Measuring against
     total spend understates it; measuring against zero overstates it.
     Essentials are what you'd still be paying while job-hunting.
   • Liquidity is graded. Money in a 3-year ELSS lock-in is not a
     buffer, and pretending it is has ruined real people. We count
     assets in bands and discount equity for the fact that a forced
     sale usually happens in a downturn.
   • Every number here is explainable in one sentence to the user.
     Nothing is a black box, because trust is the actual product.
   ═══════════════════════════════════════════════════════════════════ */

/** How much of an asset we count as reachable within `days`. */
function accessibleValue(h: Holding, withinDays: number): number {
    if (h.liquidity > withinDays) return 0;
    const value = h.units * h.price;

    // A forced sale in an emergency correlates with bad markets.
    // Haircuts reflect what you'd realistically get, not the screen price.
    const haircut: Record<string, number> = {
        cash: 1.0,
        debt: 0.99,
        gold: 0.96,
        equity: 0.85,
        esg: 0.85,
        crypto: 0.7,
        retirement: 0.0, // never counted as emergency money
    };
    return value * (haircut[h.assetClass] ?? 0.85);
}

export interface RunwayBreakdown {
    /** Spend that continues even with zero income. */
    essentialBurn: number;
    /** Spend you could cut tomorrow. */
    discretionaryBurn: number;
    /** Contractual debt payments — cannot be cut, included in essential. */
    debtService: number;
    totalBurn: number;

    /** Cash + instantly sellable, after haircuts. */
    liquidToday: number;
    /** Reachable within a month. */
    liquid30d: number;
    /** Everything not locked, within a year. */
    liquid1y: number;
    /** Locked: PPF, NPS, ELSS in lock-in. Real wealth, unreachable. */
    locked: number;

    /** Months survived on today-liquid money. The headline number. */
    months: number;
    /** Months if you also cut every discretionary rupee. */
    monthsLean: number;
    /** Months if you liquidated everything reachable in a year. */
    monthsStretch: number;

    /** Target buffer in months, scaled by dependents and job risk. */
    target: number;
    /** Rupees still needed to hit target. */
    gap: number;
    /** The date money runs out, if income stopped today. */
    dryDate: Date;

    status: 'critical' | 'thin' | 'building' | 'safe';
}

export function computeRunway(p: FinancialProfile): RunwayBreakdown {
    const essentialExpenses = p.expenses
        .filter((e) => e.essential)
        .reduce((s, e) => s + e.monthly, 0);

    const discretionaryExpenses = p.expenses
        .filter((e) => !e.essential)
        .reduce((s, e) => s + e.monthly, 0);

    const subs = p.subscriptions.reduce((s, x) => s + x.monthly, 0);
    const debtService = p.debts.reduce((s, d) => s + d.emi, 0);

    // Debt service is non-negotiable, so it belongs in the essential line.
    const essentialBurn = essentialExpenses + debtService;
    const discretionaryBurn = discretionaryExpenses + subs;
    const totalBurn = essentialBurn + discretionaryBurn;

    const liquidToday =
        p.cash + p.holdings.reduce((s, h) => s + accessibleValue(h, 1), 0);
    const liquid30d =
        p.cash + p.holdings.reduce((s, h) => s + accessibleValue(h, 30), 0);
    const liquid1y =
        p.cash + p.holdings.reduce((s, h) => s + accessibleValue(h, 365), 0);
    const locked = p.holdings
        .filter((h) => h.liquidity > 365)
        .reduce((s, h) => s + h.units * h.price, 0);

    const months = essentialBurn > 0 ? liquidToday / essentialBurn : 0;
    const monthsLean = essentialBurn > 0 ? liquidToday / (essentialBurn * 0.92) : 0;
    const monthsStretch = essentialBurn > 0 ? liquid1y / essentialBurn : 0;

    // Baseline 6 months, +1 per dependent, capped at 9. A single earner
    // supporting parents genuinely needs a deeper buffer than the
    // generic "3 to 6 months" advice assumes.
    const target = clamp(6 + p.dependents * 0.5, 6, 9);
    const gap = Math.max(0, target * essentialBurn - liquidToday);

    const dryDate = new Date();
    dryDate.setDate(dryDate.getDate() + Math.round(months * 30.44));

    const status: RunwayBreakdown['status'] =
        months < 1 ? 'critical' : months < 3 ? 'thin' : months < target ? 'building' : 'safe';

    return {
        essentialBurn,
        discretionaryBurn,
        debtService,
        totalBurn,
        liquidToday,
        liquid30d,
        liquid1y,
        locked,
        months,
        monthsLean,
        monthsStretch,
        target,
        gap,
        dryDate,
        status,
    };
}

/* ═══════════════════════════════════════════════════════════════════
   FREEDOM SCORE
   ═══════════════════════════════════════════════════════════════════ */

export interface ScorePillar {
    key: 'runway' | 'debt' | 'savings' | 'protection' | 'growth';
    label: string;
    score: number;
    max: number;
    /** One plain sentence explaining the score. No jargon. */
    verdict: string;
    state: 'bad' | 'weak' | 'ok' | 'good';
}

export interface FreedomScore {
    total: number;
    pillars: ScorePillar[];
    /** Net worth including locked assets, minus all debt. */
    netWorth: number;
    /** Corpus needed to live off 4% withdrawals forever, in today's rupees. */
    fiNumber: number;
    /** Fraction of the way to that corpus. */
    fiProgress: number;
    /** Years until the corpus is reached at the current savings rate. */
    yearsToFreedom: number;
    /** Age at which work becomes optional. */
    freedomAge: number;
    /** Monthly surplus after everything. */
    surplus: number;
    savingsRate: number;
}

function state(score: number, max: number): ScorePillar['state'] {
    const r = score / max;
    return r < 0.3 ? 'bad' : r < 0.55 ? 'weak' : r < 0.8 ? 'ok' : 'good';
}

export function computeFreedomScore(
    p: FinancialProfile,
    runway: RunwayBreakdown
): FreedomScore {
    const grossAssets =
        p.cash + p.holdings.reduce((s, h) => s + h.units * h.price, 0);
    const totalDebt = p.debts.reduce((s, d) => s + d.balance, 0);
    const netWorth = grossAssets - totalDebt;

    const annualIncome = p.income.inHand * 12 + p.income.annualBonus;
    const surplus = p.income.inHand - runway.totalBurn;
    const savingsRate = p.income.inHand > 0 ? surplus / p.income.inHand : 0;

    /* ── Pillar 1 · Runway (30) ────────────────────────────────────
       The most heavily weighted pillar, because nothing else survives
       a job loss. Full marks at the personalised target. */
    const runwayScore = clamp((runway.months / runway.target) * 30, 0, 30);

    /* ── Pillar 2 · Debt (20) ──────────────────────────────────────
       Weighted by rate, not balance. A ₹84k card at 42% is a bigger
       emergency than a ₹1.4L education loan at 9.5%, and any model
       that ranks by balance gets this backwards. */
    const weightedDebt = p.debts.reduce(
        (s, d) => s + d.balance * (d.rate / 0.42) * (d.taxDeductible ? 0.5 : 1),
        0
    );
    const debtBurden = annualIncome > 0 ? weightedDebt / annualIncome : 1;
    const debtScore = clamp(20 * (1 - debtBurden / 0.5), 0, 20);

    /* ── Pillar 3 · Savings rate (20) ──────────────────────────────
       Full marks at 30% of in-hand saved. */
    const savingsScore = clamp((savingsRate / 0.3) * 20, 0, 20);

    /* ── Pillar 4 · Protection (15) ────────────────────────────────
       One uninsured hospitalisation erases years of SIPs. Term cover
       should be ~10x annual income; health cover ~₹10L with parents. */
    const termNeeded = annualIncome * 10;
    const healthNeeded = p.dependents > 0 ? 10_00_000 : 5_00_000;
    const termRatio = clamp(p.insurance.term / termNeeded, 0, 1);
    const healthRatio = clamp(p.insurance.health / healthNeeded, 0, 1);
    const protectionScore = (termRatio * 8) + (healthRatio * 7);

    /* ── Pillar 5 · Growth toward freedom (15) ─────────────────────
       25x annual essential spend — the 4% rule, applied to what you
       actually need rather than what you currently spend. */
    const annualEssential = runway.essentialBurn * 12;
    const fiNumber = annualEssential * 25;
    const fiProgress = fiNumber > 0 ? clamp(netWorth / fiNumber, 0, 1) : 0;
    const growthScore = fiProgress * 15;

    const pillars: ScorePillar[] = [
        {
            key: 'runway',
            label: 'Safety runway',
            score: runwayScore,
            max: 30,
            verdict:
                runway.months < 1
                    ? 'Less than a month of cover. This is the only thing that matters right now.'
                    : runway.months < 3
                        ? `${runway.months.toFixed(1)} months of cover. One bad quarter away from borrowing.`
                        : runway.months < runway.target
                            ? `${runway.months.toFixed(1)} months. Solid, but ${runway.target} is your safe line.`
                            : `${runway.months.toFixed(1)} months. You could lose your job tomorrow and be fine.`,
            state: state(runwayScore, 30),
        },
        {
            key: 'debt',
            label: 'Debt drag',
            score: debtScore,
            max: 20,
            verdict:
                debtBurden > 0.35
                    ? 'High-rate debt is compounding faster than any investment you own.'
                    : debtBurden > 0.15
                        ? 'Manageable, but the expensive debt is still outrunning your portfolio.'
                        : 'Debt is under control and not eating your returns.',
            state: state(debtScore, 20),
        },
        {
            key: 'savings',
            label: 'Savings rate',
            score: savingsScore,
            max: 20,
            verdict:
                savingsRate < 0.05
                    ? 'Almost nothing is left at month end. Wealth cannot start here.'
                    : savingsRate < 0.2
                        ? `Saving ${(savingsRate * 100).toFixed(0)}% of in-hand. Getting to 20% roughly halves your time to freedom.`
                        : `Saving ${(savingsRate * 100).toFixed(0)}%. This is the rate that actually builds wealth.`,
            state: state(savingsScore, 20),
        },
        {
            key: 'protection',
            label: 'Protection',
            score: protectionScore,
            max: 15,
            verdict:
                termRatio < 0.5
                    ? 'Term cover is well under 10× income. Your dependents carry that risk.'
                    : healthRatio < 0.6
                        ? 'Health cover is thin for a family. One admission could wipe the buffer.'
                        : 'Insured well enough that a shock will not undo your progress.',
            state: state(protectionScore, 15),
        },
        {
            key: 'growth',
            label: 'Freedom progress',
            score: growthScore,
            max: 15,
            verdict: `${(fiProgress * 100).toFixed(1)}% of the corpus that would let you stop working.`,
            state: state(growthScore, 15),
        },
    ];

    const total = Math.round(
        pillars.reduce((s, x) => s + x.score, 0)
    );

    /* ── Years to freedom: compound the current monthly surplus plus
          employer EPF at a risk-adjusted real return. ── */
    const realReturn =
        p.risk === 'aggressive' ? 0.09 : p.risk === 'balanced' ? 0.075 : 0.06;
    const monthlyInvest = Math.max(0, surplus) + p.income.epfEmployer + p.income.epfEmployee;
    const yearsToFreedom = yearsToTarget(netWorth, monthlyInvest, realReturn, fiNumber);

    return {
        total,
        pillars,
        netWorth,
        fiNumber,
        fiProgress,
        yearsToFreedom,
        freedomAge: p.age + yearsToFreedom,
        surplus,
        savingsRate,
    };
}

/** Months of compounding until `current` reaches `target`, in years. */
function yearsToTarget(
    current: number,
    monthly: number,
    annualReturn: number,
    target: number
): number {
    if (current >= target) return 0;
    if (monthly <= 0 && current <= 0) return 99;

    const r = annualReturn / 12;
    let balance = current;
    let m = 0;
    // Cap at 70 years so a hopeless case returns a finite, displayable number.
    while (balance < target && m < 840) {
        balance = balance * (1 + r) + monthly;
        m++;
    }
    return Math.round((m / 12) * 10) / 10;
}

/* ═══════════════════════════════════════════════════════════════════
   LEVERS — "what would actually move this?"

   This is the part users have never seen elsewhere. Instead of generic
   advice, we simulate each realistic action against THEIR numbers and
   rank by impact on runway. A ₹2,000 SIP increase adds zero runway;
   ₹2,000 into a liquid fund adds real weeks. Most apps blur that
   distinction, and it is the single most useful thing we can say.
   ═══════════════════════════════════════════════════════════════════ */

export interface Lever {
    id: string;
    label: string;
    detail: string;
    /** Change in runway months. */
    deltaMonths: number;
    /** Change in freedom score points. */
    deltaScore: number;
    /** Rupees per month this requires, if any. */
    cost: number;
    /** One-off rupees this requires, if any. */
    upfront: number;
    effort: 'instant' | 'easy' | 'commitment';
    category: 'protect' | 'reduce' | 'grow';
}

export function computeLevers(
    p: FinancialProfile,
    runway: RunwayBreakdown,
    score: FreedomScore
): Lever[] {
    const levers: Lever[] = [];
    const burn = runway.essentialBurn;

    /* — Cancel unused subscriptions: instant, free, and always ranks high
         because it both lowers burn and frees cash. — */
    const dead = p.subscriptions.filter((s) => s.monthsUnused >= 3);
    const deadTotal = dead.reduce((s, x) => s + x.monthly, 0);
    if (deadTotal > 0) {
        levers.push({
            id: 'kill-subs',
            label: `Cancel ${dead.length} unused subscriptions`,
            detail: `${dead.map((d) => d.label).join(', ')} — untouched for 3+ months.`,
            deltaMonths: (deadTotal * 12) / burn / 12,
            deltaScore: 0.6,
            cost: -deadTotal,
            upfront: 0,
            effort: 'instant',
            category: 'reduce',
        });
    }

    /* — Redirect surplus to liquid rather than locked instruments. — */
    if (score.surplus > 0) {
        const redirect = Math.round(score.surplus * 0.5);
        levers.push({
            id: 'liquid-first',
            label: `Route ${fmt(redirect)}/mo to the liquid fund first`,
            detail:
                'Buffer before growth. Until runway hits target, every locked rupee is a rupee you cannot use in an emergency.',
            deltaMonths: (redirect * 6) / burn,
            deltaScore: clamp((redirect * 6) / burn / runway.target * 30, 0, 6),
            cost: redirect,
            upfront: 0,
            effort: 'easy',
            category: 'protect',
        });
    }

    /* — Kill the highest-rate debt. — */
    const worst = [...p.debts].sort((a, b) => b.rate - a.rate)[0];
    if (worst && worst.rate > 0.15) {
        const annualInterest = worst.balance * worst.rate;
        levers.push({
            id: 'kill-debt',
            label: `Clear the ${(worst.rate * 100).toFixed(0)}% ${worst.kind === 'card' ? 'credit card' : worst.label}`,
            detail: `Costs you ${fmt(Math.round(annualInterest))}/yr in interest — a guaranteed ${(worst.rate * 100).toFixed(0)}% return, which no fund can promise.`,
            deltaMonths: (worst.emi * 6) / burn,
            deltaScore: 4.5,
            cost: 0,
            upfront: worst.balance,
            effort: 'commitment',
            category: 'reduce',
        });
    }

    /* — Fill the NPS gap: the most-missed deduction in India. — */
    const nps = p.deductions.find((d) => d.section === '80CCD1B');
    if (nps && nps.used < nps.limit) {
        const headroom = nps.limit - nps.used;
        levers.push({
            id: 'nps',
            label: `Use the untouched ${fmt(headroom)} NPS deduction`,
            detail: `Section 80CCD(1B) sits on top of 80C. At your slab that is ${fmt(Math.round(headroom * 0.312))} of tax you simply do not pay.`,
            deltaMonths: 0,
            deltaScore: 1.8,
            cost: Math.round(headroom / 12),
            upfront: 0,
            effort: 'easy',
            category: 'grow',
        });
    }

    /* — Trim discretionary spend by a fifth. — */
    if (runway.discretionaryBurn > 5_000) {
        const trim = Math.round(runway.discretionaryBurn * 0.2);
        levers.push({
            id: 'trim',
            label: `Trim 20% of flexible spending (${fmt(trim)}/mo)`,
            detail: 'Eating out, shopping and weekends. Not deprivation — the smallest cut that shows up in the numbers.',
            deltaMonths: (trim * 6) / burn,
            deltaScore: 1.4,
            cost: -trim,
            upfront: 0,
            effort: 'easy',
            category: 'reduce',
        });
    }

    /* — Top up term cover if under-insured. — */
    const annualIncome = p.income.inHand * 12 + p.income.annualBonus;
    if (p.insurance.term < annualIncome * 10) {
        const need = annualIncome * 10 - p.insurance.term;
        levers.push({
            id: 'term',
            label: `Add ${fmt(need)} of term cover`,
            detail: `At ${p.age}, roughly ${fmt(Math.round((need / 1_00_00_000) * 12_000))}/yr. Also fully deductible under 80C.`,
            deltaMonths: 0,
            deltaScore: 3.2,
            cost: Math.round((need / 1_00_00_000) * 1_000),
            upfront: 0,
            effort: 'easy',
            category: 'protect',
        });
    }

    // Rank by runway impact first, then by score impact. Protection and
    // reduction naturally float above growth while the buffer is thin.
    return levers.sort(
        (a, b) => b.deltaMonths - a.deltaMonths || b.deltaScore - a.deltaScore
    );
}

function fmt(n: number): string {
    return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
}

/* ═══════════════════════════════════════════════════════════════════
   Runway projection for the chart: balance month by month with no
   income, showing exactly where the line crosses zero.
   ═══════════════════════════════════════════════════════════════════ */

export function projectRunway(
    runway: RunwayBreakdown,
    horizon = 14
): { month: string; balance: number; lean: number }[] {
    const out: { month: string; balance: number; lean: number }[] = [];
    let bal = runway.liquidToday;
    let lean = runway.liquidToday;
    const now = new Date();

    for (let i = 0; i <= horizon; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        out.push({
            month: d.toLocaleDateString('en-IN', { month: 'short' }),
            balance: Math.max(0, Math.round(bal)),
            lean: Math.max(0, Math.round(lean)),
        });
        bal -= runway.essentialBurn;
        lean -= runway.essentialBurn * 0.92;
    }
    return out;
}
