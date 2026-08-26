import type { AssetClass, FinancialProfile, Holding, RiskType } from '../domain/types';

/* ═══════════════════════════════════════════════════════════════════
   PORTFOLIO ENGINE

   Most portfolio screens answer "what is it worth?". That is the least
   useful question, because the number moves on its own and the user can
   do nothing about it. This engine answers the questions a person can
   actually act on:

     • What do I keep AFTER tax if I sell today?
     • Which holding is actually carrying the portfolio, and which is
       quietly bleeding it?
     • How far have I drifted from the allocation I chose?
     • How much of this can I reach in an emergency?
     • Am I accidentally concentrated in one thing?
   ═══════════════════════════════════════════════════════════════════ */

const DAY = 86_400_000;

export interface HoldingView {
    holding: Holding;
    invested: number;
    current: number;
    pnl: number;
    pnlPct: number;
    /** Share of total portfolio value. */
    weight: number;
    /** Days held — decides long vs short term capital gains. */
    daysHeld: number;
    longTerm: boolean;
    /** Tax owed if the whole position were sold today. */
    taxIfSold: number;
    /** What actually lands in the bank after that tax. */
    netIfSold: number;
    /** Contribution to total portfolio P&L, in rupees. */
    contribution: number;
    locked: boolean;
    lockDaysLeft: number;
}

/* ── Indian capital-gains rules, current as of FY25-26 onward ──
   Equity: LTCG > 12 months @ 12.5% beyond ₹1.25L exemption; STCG @ 20%.
   Debt/gold: slab rate for post-Apr-2023 purchases; we use 30%.
   Crypto (VDA): flat 30%, no holding-period benefit, no loss set-off.  */
function longTermThreshold(cls: AssetClass): number {
    switch (cls) {
        case 'equity':
        case 'esg':
            return 365;
        case 'gold':
        case 'debt':
            return 730;
        default:
            return Infinity;
    }
}

export function taxOnGain(cls: AssetClass, gain: number, longTerm: boolean): number {
    if (gain <= 0) return 0;
    switch (cls) {
        case 'equity':
        case 'esg':
            return longTerm ? gain * 0.125 : gain * 0.2;
        case 'crypto':
            return gain * 0.3; // flat, regardless of holding period
        case 'gold':
        case 'debt':
            return longTerm ? gain * 0.125 : gain * 0.3;
        case 'retirement':
        case 'cash':
            return 0;
        default:
            return gain * 0.2;
    }
}

export function viewHolding(h: Holding, totalValue: number, totalPnl: number): HoldingView {
    const invested = h.assetClass === 'retirement' || h.ticker === 'LIQUID' || h.ticker === 'CORPBOND'
        ? h.avgCost // these are stored as lump values, not per-unit
        : h.units * h.avgCost;
    const current = h.units * h.price;
    const pnl = current - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

    const daysHeld = Math.max(0, Math.floor((Date.now() - new Date(h.since).getTime()) / DAY));
    const longTerm = daysHeld >= longTermThreshold(h.assetClass);

    const tax = taxOnGain(h.assetClass, pnl, longTerm);
    const lockDaysLeft = h.lockedUntil
        ? Math.max(0, Math.ceil((new Date(h.lockedUntil).getTime() - Date.now()) / DAY))
        : 0;

    return {
        holding: h,
        invested,
        current,
        pnl,
        pnlPct,
        weight: totalValue > 0 ? (current / totalValue) * 100 : 0,
        daysHeld,
        longTerm,
        taxIfSold: tax,
        netIfSold: current - tax,
        contribution: totalPnl !== 0 ? (pnl / Math.abs(totalPnl)) * 100 : 0,
        locked: lockDaysLeft > 0,
        lockDaysLeft,
    };
}

/* ─── Target allocations by risk appetite ─── */
export const TARGET_MIX: Record<RiskType, Partial<Record<AssetClass, number>>> = {
    conservative: { equity: 30, debt: 35, gold: 10, esg: 5, crypto: 0, cash: 10, retirement: 10 },
    balanced: { equity: 45, debt: 20, gold: 8, esg: 7, crypto: 3, cash: 7, retirement: 10 },
    aggressive: { equity: 60, debt: 8, gold: 5, esg: 8, crypto: 7, cash: 4, retirement: 8 },
};

export interface AllocationSlice {
    assetClass: AssetClass;
    label: string;
    value: number;
    weight: number;
    target: number;
    /** Positive = overweight. */
    drift: number;
    /** Rupees to move to get back on target. */
    rebalance: number;
    color: string;
}

const CLASS_LABEL: Record<AssetClass, string> = {
    equity: 'Equity',
    debt: 'Debt',
    gold: 'Gold',
    crypto: 'Crypto',
    esg: 'ESG',
    cash: 'Cash',
    retirement: 'Retirement',
};

const CLASS_COLOR: Record<AssetClass, string> = {
    equity: 'var(--series-1)',
    debt: 'var(--series-2)',
    gold: 'var(--series-4)',
    crypto: 'var(--series-5)',
    esg: 'var(--series-6)',
    cash: 'var(--series-3)',
    retirement: '#7c8598',
};

export interface PortfolioSummary {
    holdings: HoldingView[];
    invested: number;
    current: number;
    pnl: number;
    pnlPct: number;

    /** Total tax owed if everything sellable were liquidated today. */
    taxIfLiquidated: number;
    /** What you'd truly walk away with. The number nobody shows. */
    netIfLiquidated: number;

    allocation: AllocationSlice[];
    /** Herfindahl index 0-100. Above ~25 means dangerously concentrated. */
    concentration: number;
    /** Largest single position by weight. */
    biggestPosition: HoldingView | null;
    topContributor: HoldingView | null;
    topDetractor: HoldingView | null;

    /** Positions sitting on losses that could offset gains this FY. */
    harvestable: { view: HoldingView; offsets: number; saves: number }[];
    /** Total tax recoverable by harvesting. */
    harvestSaving: number;

    /** Value reachable in each liquidity band. */
    ladder: { band: string; days: number; value: number }[];

    /** Simple annualised return across the whole book. */
    annualised: number;
}

export function summarisePortfolio(p: FinancialProfile): PortfolioSummary {
    const totalValueRaw = p.holdings.reduce((s, h) => s + h.units * h.price, 0);
    const preliminary = p.holdings.map((h) => viewHolding(h, totalValueRaw, 1));
    const totalPnl = preliminary.reduce((s, v) => s + v.pnl, 0);

    const holdings = p.holdings.map((h) => viewHolding(h, totalValueRaw, totalPnl));

    const invested = holdings.reduce((s, v) => s + v.invested, 0);
    const current = holdings.reduce((s, v) => s + v.current, 0);
    const pnl = current - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

    const sellable = holdings.filter((v) => !v.locked);
    const taxIfLiquidated = sellable.reduce((s, v) => s + v.taxIfSold, 0);
    const netIfLiquidated = sellable.reduce((s, v) => s + v.netIfSold, 0);

    /* ── Allocation and drift ── */
    const byClass = new Map<AssetClass, number>();
    holdings.forEach((v) => {
        byClass.set(
            v.holding.assetClass,
            (byClass.get(v.holding.assetClass) ?? 0) + v.current
        );
    });

    const target = TARGET_MIX[p.risk];
    const allocation: AllocationSlice[] = Array.from(byClass.entries())
        .map(([cls, value]) => {
            const weight = current > 0 ? (value / current) * 100 : 0;
            const tgt = target[cls] ?? 0;
            return {
                assetClass: cls,
                label: CLASS_LABEL[cls],
                value,
                weight,
                target: tgt,
                drift: weight - tgt,
                rebalance: ((tgt - weight) / 100) * current,
                color: CLASS_COLOR[cls],
            };
        })
        .sort((a, b) => b.value - a.value);

    /* ── Concentration: Herfindahl-Hirschman on position weights.
          Scaled so a single-holding portfolio reads 100. ── */
    const concentration = holdings.reduce(
        (s, v) => s + Math.pow(v.weight / 100, 2),
        0
    ) * 100;

    const sortedByPnl = [...holdings].sort((a, b) => b.pnl - a.pnl);
    const biggestPosition =
        [...holdings].sort((a, b) => b.weight - a.weight)[0] ?? null;

    /* ── Tax-loss harvesting. Losers can offset winners' gains within
          the same bucket, cutting the tax bill. Crypto is excluded —
          Indian law does not permit VDA loss set-off. ── */
    const gainsPool = holdings
        .filter((v) => v.pnl > 0 && v.holding.assetClass !== 'crypto' && !v.locked)
        .reduce((s, v) => s + v.pnl, 0);

    let remaining = gainsPool;
    const harvestable = holdings
        .filter((v) => v.pnl < 0 && v.holding.assetClass !== 'crypto' && !v.locked)
        .sort((a, b) => a.pnl - b.pnl)
        .map((v) => {
            const offsets = Math.min(Math.abs(v.pnl), remaining);
            remaining -= offsets;
            return {
                view: v,
                offsets,
                saves: taxOnGain(v.holding.assetClass, offsets, v.longTerm),
            };
        })
        .filter((h) => h.offsets > 0);

    const harvestSaving = harvestable.reduce((s, h) => s + h.saves, 0);

    /* ── Liquidity ladder ── */
    const bands: { band: string; days: number }[] = [
        { band: 'Today', days: 1 },
        { band: 'This week', days: 3 },
        { band: 'This month', days: 30 },
        { band: 'This year', days: 365 },
        { band: 'Locked', days: 99999 },
    ];
    const ladder = bands.map((b, i) => {
        const lo = i === 0 ? -1 : bands[i - 1].days;
        return {
            ...b,
            value: holdings
                .filter((v) => v.holding.liquidity > lo && v.holding.liquidity <= b.days)
                .reduce((s, v) => s + v.current, 0),
        };
    });

    /* ── Annualised return, money-weighted by each lot's holding period. ── */
    const weightedDays = holdings.reduce((s, v) => s + v.invested * v.daysHeld, 0);
    const avgYears = invested > 0 ? weightedDays / invested / 365 : 1;
    const annualised =
        invested > 0 && avgYears > 0.08
            ? (Math.pow(current / invested, 1 / avgYears) - 1) * 100
            : pnlPct;

    return {
        holdings,
        invested,
        current,
        pnl,
        pnlPct,
        taxIfLiquidated,
        netIfLiquidated,
        allocation,
        concentration,
        biggestPosition,
        topContributor: sortedByPnl[0] ?? null,
        topDetractor: sortedByPnl[sortedByPnl.length - 1] ?? null,
        harvestable,
        harvestSaving,
        ladder,
        annualised,
    };
}
