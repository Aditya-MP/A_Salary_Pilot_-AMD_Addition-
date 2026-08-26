import type { FinancialProfile } from '../domain/types';

/* ═══════════════════════════════════════════════════════════════════
   TAX REGIME ENGINE — India, FY 2025-26 onward.

   Every salaried person in India has to make one irreversible-ish
   choice each year (old vs new regime) and almost nobody computes it;
   they guess, or their HR guesses for them. This engine actually runs
   both and shows the rupee difference against THEIR deductions.

   Rates are the post-Budget-2025 structure. If slabs change, this is
   the only file that needs editing.
   ═══════════════════════════════════════════════════════════════════ */

type Slab = { upto: number; rate: number };

const NEW_SLABS: Slab[] = [
    { upto: 4_00_000, rate: 0 },
    { upto: 8_00_000, rate: 0.05 },
    { upto: 12_00_000, rate: 0.1 },
    { upto: 16_00_000, rate: 0.15 },
    { upto: 20_00_000, rate: 0.2 },
    { upto: 24_00_000, rate: 0.25 },
    { upto: Infinity, rate: 0.3 },
];

const OLD_SLABS: Slab[] = [
    { upto: 2_50_000, rate: 0 },
    { upto: 5_00_000, rate: 0.05 },
    { upto: 10_00_000, rate: 0.2 },
    { upto: Infinity, rate: 0.3 },
];

const NEW_STD_DEDUCTION = 75_000;
const OLD_STD_DEDUCTION = 50_000;
const CESS = 0.04;

function applySlabs(taxable: number, slabs: Slab[]): number {
    let tax = 0;
    let floor = 0;
    for (const s of slabs) {
        if (taxable <= floor) break;
        tax += (Math.min(taxable, s.upto) - floor) * s.rate;
        floor = s.upto;
    }
    return tax;
}

/** Marginal rate including cess — used to price every deduction. */
export function marginalRate(taxable: number, regime: 'old' | 'new'): number {
    const slabs = regime === 'new' ? NEW_SLABS : OLD_SLABS;
    for (const s of slabs) {
        if (taxable <= s.upto) return s.rate * (1 + CESS);
    }
    return 0.3 * (1 + CESS);
}

/* ─── HRA exemption: least of the three statutory limits. ─── */
export function hraExemption(p: FinancialProfile): {
    exempt: number;
    parts: { label: string; value: number; winner: boolean }[];
} {
    const annualHra = p.income.hraReceived * 12;
    const annualBasic = p.income.basic * 12;
    const annualRent = p.income.rentPaid * 12;

    const a = annualHra;
    const b = Math.max(0, annualRent - annualBasic * 0.1);
    const c = annualBasic * (p.income.metro ? 0.5 : 0.4);
    const exempt = Math.max(0, Math.min(a, b, c));

    return {
        exempt,
        parts: [
            { label: 'HRA actually received', value: a, winner: a === exempt },
            { label: 'Rent paid − 10% of basic', value: b, winner: b === exempt },
            {
                label: `${p.income.metro ? '50' : '40'}% of basic (${p.income.metro ? 'metro' : 'non-metro'})`,
                value: c,
                winner: c === exempt,
            },
        ],
    };
}

export interface RegimeResult {
    regime: 'old' | 'new';
    gross: number;
    deductionsAllowed: number;
    taxable: number;
    tax: number;
    cess: number;
    total: number;
    /** Effective rate on gross income. */
    effective: number;
    marginal: number;
}

export interface RegimeComparison {
    old: RegimeResult;
    new: RegimeResult;
    winner: 'old' | 'new';
    saving: number;
    /** Extra 80C/80D/NPS needed for old to beat new, 0 if it already does. */
    breakEvenDeductions: number;
    hra: ReturnType<typeof hraExemption>;
}

export function compareRegimes(p: FinancialProfile): RegimeComparison {
    const gross = p.income.inHand * 12 + p.income.annualBonus + p.income.epfEmployee * 12;
    const hra = hraExemption(p);

    /* — Old regime: everything is claimable. — */
    const chapterVIA = p.deductions
        .filter((d) => d.section !== 'HRA')
        .reduce((s, d) => s + (d.limit > 0 ? Math.min(d.used, d.limit) : d.used), 0);

    const oldDeductions = OLD_STD_DEDUCTION + hra.exempt + chapterVIA;
    const oldTaxable = Math.max(0, gross - oldDeductions);
    let oldTax = applySlabs(oldTaxable, OLD_SLABS);
    if (oldTaxable <= 5_00_000) oldTax = 0; // 87A rebate
    const oldCess = oldTax * CESS;

    /* — New regime: standard deduction and employer NPS only. — */
    const newDeductions = NEW_STD_DEDUCTION;
    const newTaxable = Math.max(0, gross - newDeductions);
    let newTax = applySlabs(newTaxable, NEW_SLABS);
    if (newTaxable <= 12_00_000) newTax = 0; // 87A rebate, new regime
    const newCess = newTax * CESS;

    const oldResult: RegimeResult = {
        regime: 'old',
        gross,
        deductionsAllowed: oldDeductions,
        taxable: oldTaxable,
        tax: oldTax,
        cess: oldCess,
        total: oldTax + oldCess,
        effective: gross > 0 ? ((oldTax + oldCess) / gross) * 100 : 0,
        marginal: marginalRate(oldTaxable, 'old'),
    };

    const newResult: RegimeResult = {
        regime: 'new',
        gross,
        deductionsAllowed: newDeductions,
        taxable: newTaxable,
        tax: newTax,
        cess: newCess,
        total: newTax + newCess,
        effective: gross > 0 ? ((newTax + newCess) / gross) * 100 : 0,
        marginal: marginalRate(newTaxable, 'new'),
    };

    const winner = oldResult.total <= newResult.total ? 'old' : 'new';
    const saving = Math.abs(oldResult.total - newResult.total);

    /* — How many more deductions would flip the answer? Solved by
         walking upward until old regime wins. — */
    let breakEven = 0;
    if (winner === 'new') {
        for (let extra = 10_000; extra <= 5_00_000; extra += 10_000) {
            const t = Math.max(0, gross - (oldDeductions + extra));
            let tax = applySlabs(t, OLD_SLABS);
            if (t <= 5_00_000) tax = 0;
            if (tax * (1 + CESS) <= newResult.total) {
                breakEven = extra;
                break;
            }
        }
    }

    return { old: oldResult, new: newResult, winner, saving, breakEvenDeductions: breakEven, hra };
}

/* ═══════════════════════════════════════════════════════════════════
   DEDUCTION HEADROOM — "what am I leaving on the table?"
   ═══════════════════════════════════════════════════════════════════ */

export interface Headroom {
    section: string;
    label: string;
    limit: number;
    used: number;
    unused: number;
    /** Actual rupees saved if the headroom were filled. */
    worth: number;
    filled: number;
    note: string;
    fillers: string[];
    urgent: boolean;
}

export function computeHeadroom(p: FinancialProfile): {
    slots: Headroom[];
    totalUnused: number;
    totalWorth: number;
} {
    const cmp = compareRegimes(p);
    // Deductions are only worth anything under the old regime.
    const rate = cmp.old.marginal;

    const slots: Headroom[] = p.deductions
        .filter((d) => d.limit > 0)
        .map((d) => {
            const unused = Math.max(0, d.limit - d.used);
            return {
                section: d.section,
                label: d.label,
                limit: d.limit,
                used: d.used,
                unused,
                worth: unused * rate,
                filled: d.limit > 0 ? (d.used / d.limit) * 100 : 100,
                note: d.note,
                fillers: d.fillers,
                urgent: unused > 20_000,
            };
        })
        .sort((a, b) => b.worth - a.worth);

    return {
        slots,
        totalUnused: slots.reduce((s, x) => s + x.unused, 0),
        totalWorth: slots.reduce((s, x) => s + x.worth, 0),
    };
}
