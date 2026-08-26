/* ═══════════════════════════════════════════════════════════════════
   Domain model.

   The old app stored three numbers (equity/crypto/esg) and derived
   everything from them, which is why every screen had to hardcode its
   own facts. This is the real shape of a salaried person's finances,
   and every screen now reads from it.
   ═══════════════════════════════════════════════════════════════════ */

export type RiskType = 'conservative' | 'balanced' | 'aggressive';

/* ─── Income ─── */

export interface IncomeProfile {
    /** Annual cost-to-company, before any deduction. */
    ctc: number;
    /** What actually hits the bank each month, after tax + EPF. */
    inHand: number;
    /** Employee EPF contribution per month (also counts under 80C). */
    epfEmployee: number;
    /** Employer EPF per month — real wealth, but not spendable. */
    epfEmployer: number;
    /** Day of month salary lands. */
    payDay: number;
    /** Expected annual hike, as a fraction. Used for projections. */
    expectedHike: number;
    /** Months of variable/bonus pay expected this year, in rupees total. */
    annualBonus: number;
    /** Metro cities get 50% HRA exemption vs 40% elsewhere. */
    metro: boolean;
    /** Monthly rent paid — drives the HRA exemption. */
    rentPaid: number;
    /** Monthly HRA component of salary. */
    hraReceived: number;
    /** Monthly basic salary — the base for HRA and EPF maths. */
    basic: number;
}

/* ─── Spending ─── */

export type ExpenseKind =
    | 'housing'
    | 'debt'
    | 'food'
    | 'transport'
    | 'utilities'
    | 'health'
    | 'family'
    | 'lifestyle'
    | 'subscriptions';

export interface Expense {
    id: string;
    label: string;
    kind: ExpenseKind;
    monthly: number;
    /**
     * Essential expenses are what you'd still pay if income stopped.
     * This distinction is the whole basis of the runway calculation —
     * runway measured against total spend is a vanity number.
     */
    essential: boolean;
}

export interface Subscription {
    id: string;
    label: string;
    monthly: number;
    /** Months since the user last actually used it. Drives leak detection. */
    monthsUnused: number;
    /** Renews annually — cancelling mid-cycle wastes the remainder. */
    annual?: boolean;
}

/* ─── Liabilities ─── */

export type DebtKind = 'card' | 'personal' | 'auto' | 'home' | 'education';

export interface Debt {
    id: string;
    label: string;
    kind: DebtKind;
    /** Outstanding principal. */
    balance: number;
    /** Annual interest rate as a fraction, e.g. 0.42 for a 42% card. */
    rate: number;
    /** Contractual monthly payment. */
    emi: number;
    /** Home and education loan interest carry deductions. */
    taxDeductible: boolean;
}

/* ─── Assets ─── */

export type AssetClass =
    | 'equity'
    | 'debt'
    | 'gold'
    | 'crypto'
    | 'esg'
    | 'cash'
    | 'retirement';

/** How quickly an asset can become spendable cash, in days. */
export type Liquidity = 0 | 1 | 3 | 30 | 365 | 9999;

export interface Holding {
    id: string;
    label: string;
    ticker: string;
    assetClass: AssetClass;
    units: number;
    /** Weighted average buy price per unit. */
    avgCost: number;
    /** Current price per unit. Live-ticked by the price feed. */
    price: number;
    /** Days to convert to cash. 9999 = locked (PPF, ELSS in lock-in). */
    liquidity: Liquidity;
    /** ISO date of first purchase — drives long vs short term capital gains. */
    since: string;
    /** Counts toward a tax deduction section, if any. */
    taxSection?: TaxSection;
    /** Lock-in end date, if the instrument has one. */
    lockedUntil?: string;
}

/* ─── Goals ─── */

export interface Goal {
    id: string;
    label: string;
    target: number;
    saved: number;
    /** ISO date. */
    by: string;
    /** Goals below this line get funded before any wealth-building. */
    priority: 'safety' | 'commitment' | 'aspiration';
    monthlyContribution: number;
}

/* ─── Tax ─── */

export type TaxSection =
    | '80C'
    | '80CCD1B'
    | '80D'
    | '80E'
    | '80G'
    | '80TTA'
    | 'HRA'
    | '24B';

export interface DeductionSlot {
    section: TaxSection;
    label: string;
    limit: number;
    used: number;
    /** Short note on what qualifies. */
    note: string;
    /** Instruments that fill this slot. */
    fillers: string[];
}

/* ─── Aggregate ─── */

export interface FinancialProfile {
    name: string;
    age: number;
    dependents: number;
    income: IncomeProfile;
    expenses: Expense[];
    subscriptions: Subscription[];
    debts: Debt[];
    holdings: Holding[];
    goals: Goal[];
    deductions: DeductionSlot[];
    /** Cash sitting in savings accounts — instantly available. */
    cash: number;
    /** Health/term cover in force. Absence of cover destroys runway. */
    insurance: { term: number; health: number };
    risk: RiskType;
}
