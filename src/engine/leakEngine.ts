import type { FinancialProfile } from '../domain/types';

/* ═══════════════════════════════════════════════════════════════════
   LEAK ENGINE — money quietly leaving the account.

   The gap most finance apps never close: they are excellent at showing
   you what you own and useless at showing you what you are losing.
   For a salaried person the losses are boring and fixable — a dead
   subscription, a card revolving at 42%, idle cash earning 3% while
   a 14% loan runs. Each one is worth more than another SIP.

   Everything here is expressed as an ANNUAL rupee figure, because
   "₹210 a month" feels free and "₹2,520 a year" does not.
   ═══════════════════════════════════════════════════════════════════ */

export type LeakKind = 'subscription' | 'interest' | 'idle-cash' | 'tax' | 'insurance';

export interface Leak {
    id: string;
    kind: LeakKind;
    label: string;
    /** What it costs per year if nothing changes. */
    annualCost: number;
    /** Plain sentence: why this is a leak. */
    why: string;
    /** Plain sentence: exactly what to do. */
    fix: string;
    /** How hard the fix is. */
    effort: 'instant' | 'easy' | 'commitment';
    /** Confidence that this is genuinely wasted, 0-1. */
    confidence: number;
}

export function findLeaks(p: FinancialProfile): {
    leaks: Leak[];
    totalAnnual: number;
    recoverableNow: number;
} {
    const leaks: Leak[] = [];

    /* ── 1 · Dead subscriptions ── */
    p.subscriptions
        .filter((s) => s.monthsUnused >= 3)
        .forEach((s) => {
            leaks.push({
                id: `sub-${s.id}`,
                kind: 'subscription',
                label: s.label,
                annualCost: s.monthly * 12,
                why: `Not used in ${s.monthsUnused} months. You have paid roughly ₹${(s.monthly * s.monthsUnused).toLocaleString('en-IN')} for nothing.`,
                fix: s.annual
                    ? 'Turn off auto-renew now — it will lapse at the end of the paid term rather than refunding.'
                    : 'Cancel it. Takes about two minutes and stops the next charge.',
                effort: 'instant',
                confidence: s.monthsUnused >= 6 ? 0.95 : 0.75,
            });
        });

    /* ── 2 · High-interest debt ── */
    p.debts
        .filter((d) => d.rate > 0.12)
        .forEach((d) => {
            const annualInterest = d.balance * d.rate;
            leaks.push({
                id: `debt-${d.id}`,
                kind: 'interest',
                label: `${d.label} — ${(d.rate * 100).toFixed(1)}% interest`,
                annualCost: annualInterest,
                why: `Your portfolio is compounding at roughly 9–12%. This debt is compounding against you at ${(d.rate * 100).toFixed(0)}%, so every rupee here beats every rupee invested.`,
                fix:
                    d.kind === 'card'
                        ? 'Clear this before any new investment. Paying it off is a guaranteed, tax-free return no fund can match.'
                        : 'Prepay whatever you can each month — check the prepayment penalty first, it is usually zero for floating-rate loans.',
                effort: 'commitment',
                confidence: 1,
            });
        });

    /* ── 3 · Idle cash ──
       Cash beyond the emergency target earns ~3% in savings while
       inflation runs ~5.5%. That is a real, silent loss. */
    const essentialBurn =
        p.expenses.filter((e) => e.essential).reduce((s, e) => s + e.monthly, 0) +
        p.debts.reduce((s, d) => s + d.emi, 0);
    const bufferNeeded = essentialBurn * 1.5; // 6 weeks in the current account is plenty
    const idle = p.cash - bufferNeeded;

    if (idle > 20_000) {
        const lost = idle * (0.068 - 0.03); // liquid fund vs savings account
        leaks.push({
            id: 'idle-cash',
            kind: 'idle-cash',
            label: 'Cash sitting in the savings account',
            annualCost: lost,
            why: `₹${Math.round(idle).toLocaleString('en-IN')} above what you need on hand, earning about 3% while a liquid fund pays around 6.8%.`,
            fix: 'Move the excess into a liquid fund. Still redeemable in one working day, so it stays a real emergency buffer.',
            effort: 'easy',
            confidence: 0.85,
        });
    }

    /* ── 4 · Unclaimed deductions ── */
    p.deductions
        .filter((d) => d.limit > 0 && d.limit - d.used > 10_000)
        .forEach((d) => {
            const unused = d.limit - d.used;
            leaks.push({
                id: `tax-${d.section}`,
                kind: 'tax',
                label: `${d.label} — ₹${unused.toLocaleString('en-IN')} unclaimed`,
                annualCost: unused * 0.312,
                why: `${d.note}. You are paying tax on income the law says you do not have to.`,
                fix: `Fill it with: ${d.fillers.slice(0, 2).join(' or ')}. Declare it before your employer's proof deadline.`,
                effort: 'easy',
                confidence: 0.9,
            });
        });

    /* ── 5 · Under-insurance — the biggest expected loss of all,
           expressed as risk-weighted annual cost rather than a premium. ── */
    const annualIncome = p.income.inHand * 12 + p.income.annualBonus;
    if (p.insurance.term < annualIncome * 10) {
        const shortfall = annualIncome * 10 - p.insurance.term;
        leaks.push({
            id: 'under-term',
            kind: 'insurance',
            label: 'Term cover shortfall',
            // ~0.1% annual mortality at this age, applied to the gap.
            annualCost: shortfall * 0.001,
            why: `You carry ₹${(p.insurance.term / 1_00_000).toFixed(0)}L of cover against ₹${((annualIncome * 10) / 1_00_000).toFixed(0)}L of need. With ${p.dependents} dependents, that gap is their problem, not yours.`,
            fix: `Add ₹${(shortfall / 1_00_000).toFixed(0)}L of pure term cover. At ${p.age} it is cheap, and the premium also counts under 80C.`,
            effort: 'easy',
            confidence: 0.8,
        });
    }

    if (p.insurance.health < (p.dependents > 0 ? 10_00_000 : 5_00_000)) {
        leaks.push({
            id: 'under-health',
            kind: 'insurance',
            label: 'Health cover below family need',
            annualCost: 18_000,
            why: 'A single hospitalisation in a metro private hospital routinely crosses ₹5L. Anything above your cover comes out of the emergency fund.',
            fix: 'Add a ₹10L super top-up. They are unusually cheap above a ₹5L deductible, and the premium counts under 80D.',
            effort: 'easy',
            confidence: 0.7,
        });
    }

    leaks.sort((a, b) => b.annualCost - a.annualCost);

    return {
        leaks,
        totalAnnual: leaks.reduce((s, l) => s + l.annualCost, 0),
        recoverableNow: leaks
            .filter((l) => l.effort === 'instant' || l.effort === 'easy')
            .reduce((s, l) => s + l.annualCost, 0),
    };
}

/* ═══════════════════════════════════════════════════════════════════
   PAYDAY PLAN — where the next salary actually goes.
   ═══════════════════════════════════════════════════════════════════ */

export interface PaydaySlice {
    label: string;
    amount: number;
    kind: 'locked' | 'auto' | 'free';
    color: string;
    note: string;
}

export function planPayday(p: FinancialProfile, investPct: number) {
    const income = p.income.inHand;

    const essentials = p.expenses
        .filter((e) => e.essential)
        .reduce((s, e) => s + e.monthly, 0);
    const emis = p.debts.reduce((s, d) => s + d.emi, 0);
    const subs = p.subscriptions.reduce((s, x) => s + x.monthly, 0);
    const invest = Math.round((income * investPct) / 100);
    const free = Math.max(0, income - essentials - emis - subs - invest);

    const slices: PaydaySlice[] = [
        {
            label: 'Essentials',
            amount: essentials,
            kind: 'locked',
            color: 'var(--series-2)',
            note: 'Rent, food, utilities, family support — committed before the month starts.',
        },
        {
            label: 'Loan EMIs',
            amount: emis,
            kind: 'locked',
            color: 'var(--loss)',
            note: 'Contractual. Missing one costs far more than it saves.',
        },
        {
            label: 'Subscriptions',
            amount: subs,
            kind: 'locked',
            color: 'var(--series-5)',
            note: 'Recurring charges that renew whether or not you use them.',
        },
        {
            label: 'Invested',
            amount: invest,
            kind: 'auto',
            color: 'var(--accent)',
            note: 'Swept out on payday, before it can be spent. This is the whole trick.',
        },
        {
            label: 'Free to spend',
            amount: free,
            kind: 'free',
            color: 'var(--series-4)',
            note: 'Genuinely yours. Spending this guilt-free is the point of budgeting at all.',
        },
    ];

    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), p.income.payDay);
    if (next < now) next.setMonth(next.getMonth() + 1);
    const daysToPayday = Math.ceil((next.getTime() - now.getTime()) / 86_400_000);

    return { slices, income, invest, free, daysToPayday, nextPayday: next };
}
