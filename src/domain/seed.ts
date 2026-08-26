import type { FinancialProfile } from './types';

/* ═══════════════════════════════════════════════════════════════════
   Seed profile — a deliberately *realistic* mid-career Indian
   salaried employee, not an idealised one.

   The numbers are chosen so the app has something honest to say:
   a thin ~11% savings rate, a 42% credit card quietly eating returns,
   ₹50k of NPS headroom untouched, four dead subscriptions, and a
   buffer that leans far too heavily on Bitcoin and two single stocks.
   A demo where everything is already fine teaches the user nothing.

   In-hand is set so the profile runs a small but real surplus. An
   earlier version ran a deficit, which made the app cheerfully
   recommend routing 20% of salary into investments that did not
   exist — exactly the kind of advice this product is meant to catch.
   ═══════════════════════════════════════════════════════════════════ */

export const seedProfile: FinancialProfile = {
    name: 'Aditya',
    age: 29,
    dependents: 2,

    income: {
        ctc: 18_00_000,
        inHand: 1_24_000,
        epfEmployee: 5_400,
        epfEmployer: 5_400,
        payDay: 1,
        expectedHike: 0.09,
        annualBonus: 1_80_000,
        metro: true,
        rentPaid: 32_000,
        hraReceived: 27_000,
        basic: 54_000,
    },

    /* ─── Monthly spending. `essential` is the survival line. ─── */
    expenses: [
        { id: 'e1', label: 'Rent', kind: 'housing', monthly: 32_000, essential: true },
        { id: 'e2', label: 'Groceries & cooking gas', kind: 'food', monthly: 11_000, essential: true },
        { id: 'e3', label: 'Electricity, water, internet', kind: 'utilities', monthly: 4_200, essential: true },
        { id: 'e4', label: 'Parents — monthly support', kind: 'family', monthly: 12_000, essential: true },
        { id: 'e5', label: 'Commute & fuel', kind: 'transport', monthly: 4_800, essential: true },
        { id: 'e6', label: 'Medicines & checkups', kind: 'health', monthly: 2_400, essential: true },
        { id: 'e7', label: 'Eating out & delivery', kind: 'food', monthly: 8_600, essential: false },
        { id: 'e8', label: 'Shopping & lifestyle', kind: 'lifestyle', monthly: 6_500, essential: false },
        { id: 'e9', label: 'Travel & weekends', kind: 'lifestyle', monthly: 4_000, essential: false },
    ],

    /* ─── Subscriptions are tracked separately because they are the
           single most recoverable leak in a salaried budget. ─── */
    subscriptions: [
        { id: 's1', label: 'Netflix', monthly: 649, monthsUnused: 0 },
        { id: 's2', label: 'Spotify', monthly: 119, monthsUnused: 0 },
        { id: 's3', label: 'Gym membership', monthly: 2_200, monthsUnused: 5 },
        { id: 's4', label: 'Cloud storage 2TB', monthly: 210, monthsUnused: 8 },
        { id: 's5', label: 'Trading terminal Pro', monthly: 899, monthsUnused: 4 },
        { id: 's6', label: 'Language app (annual)', monthly: 542, monthsUnused: 7, annual: true },
        { id: 's7', label: 'Prime Video', monthly: 299, monthsUnused: 1 },
    ],

    /* ─── Debt, ordered worst-first by rate. ─── */
    debts: [
        {
            id: 'd1',
            label: 'HDFC Credit Card — revolving',
            kind: 'card',
            balance: 84_000,
            rate: 0.42,
            emi: 4_200,
            taxDeductible: false,
        },
        {
            id: 'd2',
            label: 'Personal loan — 2 yrs left',
            kind: 'personal',
            balance: 2_10_000,
            rate: 0.145,
            emi: 10_100,
            taxDeductible: false,
        },
        {
            id: 'd3',
            label: 'Education loan',
            kind: 'education',
            balance: 1_40_000,
            rate: 0.095,
            emi: 6_200,
            taxDeductible: true,
        },
    ],

    /* ─── Holdings. Mixed liquidity on purpose — most people think
           they have a buffer that is actually locked up. ─── */
    holdings: [
        { id: 'h1', label: 'Nifty 50 Index Fund', ticker: 'NIFTY50', assetClass: 'equity', units: 420, avgCost: 232, price: 261, liquidity: 3, since: '2023-04-12' },
        { id: 'h2', label: 'Parag Parikh Flexi Cap', ticker: 'PPFCF', assetClass: 'equity', units: 310, avgCost: 68, price: 79, liquidity: 3, since: '2023-07-01' },
        { id: 'h3', label: 'Reliance Industries', ticker: 'RELIANCE', assetClass: 'equity', units: 34, avgCost: 2_480, price: 2_712, liquidity: 1, since: '2024-01-22' },
        { id: 'h4', label: 'HDFC Bank', ticker: 'HDFCBANK', assetClass: 'equity', units: 46, avgCost: 1_610, price: 1_558, liquidity: 1, since: '2024-06-08' },
        { id: 'h5', label: 'Mirae ELSS Tax Saver', ticker: 'ELSS', assetClass: 'equity', units: 190, avgCost: 39, price: 46, liquidity: 9999, since: '2024-02-15', taxSection: '80C', lockedUntil: '2027-02-15' },
        { id: 'h6', label: 'PPF Account', ticker: 'PPF', assetClass: 'retirement', units: 1, avgCost: 1_85_000, price: 2_04_000, liquidity: 9999, since: '2021-05-01', taxSection: '80C', lockedUntil: '2036-05-01' },
        { id: 'h7', label: 'NPS Tier-I', ticker: 'NPS', assetClass: 'retirement', units: 1, avgCost: 62_000, price: 71_400, liquidity: 9999, since: '2022-08-10', taxSection: '80CCD1B', lockedUntil: '2056-01-01' },
        { id: 'h8', label: 'Liquid Fund — emergency', ticker: 'LIQUID', assetClass: 'cash', units: 1, avgCost: 96_000, price: 99_100, liquidity: 1, since: '2024-03-01' },
        { id: 'h9', label: 'Sovereign Gold Bond', ticker: 'SGB', assetClass: 'gold', units: 22, avgCost: 5_920, price: 6_640, liquidity: 30, since: '2023-09-19' },
        { id: 'h10', label: 'Bitcoin', ticker: 'BTC', assetClass: 'crypto', units: 0.038, avgCost: 46_20_000, price: 52_80_000, liquidity: 1, since: '2024-05-04' },
        { id: 'h11', label: 'Ethereum', ticker: 'ETH', assetClass: 'crypto', units: 0.42, avgCost: 2_18_000, price: 1_96_000, liquidity: 1, since: '2024-11-20' },
        { id: 'h12', label: 'Nifty ESG Index Fund', ticker: 'ESG', assetClass: 'esg', units: 260, avgCost: 41, price: 44, liquidity: 3, since: '2024-04-11' },
        { id: 'h13', label: 'Corporate Bond Fund', ticker: 'CORPBOND', assetClass: 'debt', units: 1, avgCost: 58_000, price: 61_300, liquidity: 3, since: '2023-11-02' },
    ],

    goals: [
        { id: 'g1', label: 'Emergency fund — 6 months', target: 4_60_000, saved: 1_99_100, by: '2027-06-30', priority: 'safety', monthlyContribution: 8_000 },
        { id: 'g2', label: 'Parents’ health cover top-up', target: 90_000, saved: 22_000, by: '2026-12-31', priority: 'safety', monthlyContribution: 3_000 },
        { id: 'g3', label: 'Clear credit card', target: 84_000, saved: 0, by: '2026-12-31', priority: 'commitment', monthlyContribution: 4_200 },
        { id: 'g4', label: 'House down payment', target: 25_00_000, saved: 3_10_000, by: '2031-04-01', priority: 'aspiration', monthlyContribution: 12_000 },
        { id: 'g5', label: 'Sabbatical fund', target: 6_00_000, saved: 41_000, by: '2029-01-01', priority: 'aspiration', monthlyContribution: 4_000 },
    ],

    /* ─── Deduction slots. `used` is what is already committed this FY. ─── */
    deductions: [
        {
            section: '80C',
            label: 'Section 80C',
            limit: 1_50_000,
            used: 92_800,
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
            used: 18_000,
            note: '₹25k self + ₹50k for senior-citizen parents',
            fillers: ['Own health premium', 'Parents’ health premium', 'Preventive checkup'],
        },
        {
            section: '80E',
            label: 'Section 80E — Education loan',
            limit: 0,
            used: 13_300,
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
    ],

    cash: 74_500,

    insurance: {
        term: 50_00_000,
        health: 5_00_000,
    },

    risk: 'balanced',
};
