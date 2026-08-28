import type { FinancialProfile, DeductionSlot } from './types';

/* ═══════════════════════════════════════════════════════════════════
   What a brand-new account actually contains: nothing.

   WHY THIS REPLACES THE SEED PROFILE
   ----------------------------------
   Every new user used to open the app on a fictional person's finances
   — ₹1.24L in hand, three loans, thirteen holdings, a 5.9-month runway.
   Signing up and immediately being told your runway is 5.9 months is
   not a friendly default; it is the app stating a fact about you that
   it invented. Once a single number on the dashboard is untrue, no
   number on the dashboard can be trusted, and the entire premise of
   the product is that the numbers are worth trusting.

   So a new profile is empty, and the app asks before it answers.

   WHAT IS STILL HERE, AND WHY IT IS NOT FAKE DATA
   -----------------------------------------------
   The deduction slots below. Those are Indian tax law — the ₹1.5L 80C
   ceiling exists whether or not this user has heard of it. They are
   the same for everyone, and every `used` figure is zero, which is the
   true starting value. Empty scaffolding is not invented data.
   ═══════════════════════════════════════════════════════════════════ */

/** The statutory deduction slots, all unused. Tax law, not user data. */
export const emptyDeductions: DeductionSlot[] = [
    {
        section: '80C',
        label: 'Section 80C',
        limit: 1_50_000,
        used: 0,
        note: 'EPF, ELSS, PPF, term premium, tuition fees, home loan principal',
        fillers: ['EPF (automatic)', 'ELSS funds', 'PPF', 'Term insurance premium'],
    },
    {
        section: '80CCD1B',
        label: 'Section 80CCD(1B) — NPS',
        limit: 50_000,
        used: 0,
        note: 'Over and above 80C. The single most-missed deduction in India.',
        fillers: ['NPS Tier-I contribution'],
    },
    {
        section: '80D',
        label: 'Section 80D — Health',
        limit: 75_000,
        used: 0,
        note: '₹25k self + ₹50k for senior-citizen parents',
        fillers: ['Own health premium', 'Parents’ health premium', 'Preventive checkup'],
    },
    {
        section: '80E',
        label: 'Section 80E — Education loan',
        limit: 0,
        used: 0,
        note: 'Interest is fully deductible, no upper cap, for 8 years',
        fillers: ['Education loan interest'],
    },
    {
        section: 'HRA',
        label: 'HRA exemption',
        limit: 0,
        used: 0,
        note: 'Least of: actual HRA, rent − 10% basic, or 50% basic (metro)',
        fillers: ['Rent receipts', 'Landlord PAN if rent > ₹1L/yr'],
    },
];

export const emptyProfile: FinancialProfile = {
    name: '',
    age: 0,
    dependents: 0,

    income: {
        ctc: 0,
        inHand: 0,
        epfEmployee: 0,
        epfEmployer: 0,
        payDay: 1,
        expectedHike: 0,
        annualBonus: 0,
        metro: false,
        rentPaid: 0,
        hraReceived: 0,
        basic: 0,
    },

    expenses: [],
    subscriptions: [],
    debts: [],
    holdings: [],
    goals: [],
    deductions: emptyDeductions,

    cash: 0,
    insurance: { term: 0, health: 0 },
    risk: 'balanced',
};

/**
 * Whether the profile holds enough to say anything true.
 *
 * The runway engine divides by the essential burn. With an empty profile
 * that is zero, and the guard inside returns 0 months — which renders as
 * "0.0 months · critical". That is not an empty state, it is a *worse*
 * lie than the seed data was: it tells a new user they are broke.
 *
 * Every screen that shows a derived number checks this first and offers
 * to collect the inputs instead of inventing them.
 */
export function hasFinancialData(p: FinancialProfile): boolean {
    const essentialBurn =
        p.expenses.filter((e) => e.essential).reduce((s, e) => s + e.monthly, 0) +
        p.debts.reduce((s, d) => s + d.emi, 0);

    return p.income.inHand > 0 && essentialBurn > 0;
}
