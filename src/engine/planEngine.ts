import { AUTO_ALLOCATABLE, instrument, type Instrument } from '../domain/market';
import type { AssetClass } from '../domain/types';

/* ═══════════════════════════════════════════════════════════════════
   From asset-class weights to an actual basket.

   M5 answers "how much in equity, debt, gold, crypto". It does not and
   should not answer "which fund", because it was evaluated on six asset
   classes and has no information about individual instruments.

   This file answers the second question, and it does so with rules a
   user can read rather than a model they have to trust:

     1. Only instruments marked autoAllocate. Single companies are
        excluded — choosing between them needs fundamentals this app
        does not have, and a made-up quality score is fake data wearing
        a lab coat. Locked instruments are excluded too: money that
        cannot be reached for three years is not part of a plan someone
        may need to unwind.

     2. Within a class, spread across the available funds rather than
        picking one. There is no defensible basis for preferring the
        Nifty 50 fund over the Next 50 fund on any given day, and
        pretending otherwise is exactly the false precision this app
        exists to avoid.

     3. The riskier corners of each class are gated on the plan's risk
        level. A conservative plan gets large caps; small caps appear
        only in the aggressive one.

   WHAT THIS DELIBERATELY DOES NOT DO
   ----------------------------------
   Promise returns. M5's own evaluation found this approach earns LESS
   than equal weight while cutting volatility by 54% and drawdown by
   60%. Every surface that renders a plan carries that trade-off.
   ═══════════════════════════════════════════════════════════════════ */

export type RiskLevel = 'conservative' | 'balanced' | 'aggressive';

/** M5's class names → the domain's asset classes. */
const CLASS_MAP: Record<string, AssetClass> = {
    equity_large: 'equity',
    equity_flexi: 'equity',
    debt: 'debt',
    gold: 'gold',
    esg: 'esg',
    crypto: 'crypto',
};

/**
 * Which instruments may fill each of M5's six buckets, in order of how
 * defensible they are as a default. `minRisk` gates the rougher options.
 */
const BUCKET: Record<string, { ticker: string; minRisk: RiskLevel }[]> = {
    equity_large: [
        { ticker: 'NIFTY50', minRisk: 'conservative' },
        { ticker: 'SP500', minRisk: 'conservative' },
        { ticker: 'NEXT50', minRisk: 'balanced' },
        { ticker: 'NASDAQ100', minRisk: 'aggressive' },
    ],
    equity_flexi: [
        { ticker: 'FLEXICAP', minRisk: 'conservative' },
        { ticker: 'MIDCAP150', minRisk: 'balanced' },
        { ticker: 'SMALLCAP250', minRisk: 'aggressive' },
    ],
    debt: [
        { ticker: 'CORPBOND', minRisk: 'conservative' },
        { ticker: 'GILT10', minRisk: 'conservative' },
        { ticker: 'LIQUIDBEES', minRisk: 'conservative' },
    ],
    gold: [{ ticker: 'GOLDBEES', minRisk: 'conservative' }],
    esg: [{ ticker: 'NIFTYESG', minRisk: 'conservative' }],
    crypto: [
        { ticker: 'BTC', minRisk: 'balanced' },
        { ticker: 'ETH', minRisk: 'aggressive' },
    ],
};

const RANK: Record<RiskLevel, number> = { conservative: 0, balanced: 1, aggressive: 2 };

export interface PlanLine {
    instrument: Instrument;
    /** Share of the whole plan, 0–1. */
    weight: number;
    /** Whole paise to spend on this line. */
    paise: number;
    /** Units at the current price — indicative, priced again on execution. */
    units: number;
    /** Which M5 bucket this line came from. */
    bucket: string;
    assetClass: AssetClass;
}

export interface Plan {
    lines: PlanLine[];
    /** Sum of every line. Equals the requested amount exactly. */
    totalPaise: number;
    /** Class-level totals for the chart. */
    byClass: { assetClass: AssetClass; weight: number; paise: number }[];
    risk: RiskLevel;
}

/**
 * Builds an executable plan.
 *
 * @param weights   M5's asset-class weights (must sum to ~1)
 * @param amountPaise  what the user is investing, in whole paise
 * @param risk      the plan's risk level, gating the rougher instruments
 * @param prices    live prices by ticker, in rupees
 */
export function buildPlan(
    weights: Record<string, number>,
    amountPaise: number,
    risk: RiskLevel,
    prices: Record<string, number>,
): Plan {
    const allowed = new Set(AUTO_ALLOCATABLE.map((i) => i.ticker));
    const lines: PlanLine[] = [];

    for (const [bucket, classWeight] of Object.entries(weights)) {
        if (classWeight <= 0) continue;

        const picks = (BUCKET[bucket] ?? [])
            .filter((p) => RANK[p.minRisk] <= RANK[risk] && allowed.has(p.ticker));

        if (picks.length === 0) continue;

        // Split the class evenly across its eligible instruments. See rule 2:
        // there is no honest basis for weighting one broad index over another.
        const each = classWeight / picks.length;

        for (const p of picks) {
            const ins = instrument(p.ticker);
            if (!ins) continue;
            lines.push({
                instrument: ins,
                weight: each,
                paise: 0, // assigned below, once the whole plan is known
                units: 0,
                bucket,
                assetClass: CLASS_MAP[bucket] ?? ins.assetClass,
            });
        }
    }

    // Weights may not sum to exactly 1 — a class can be dropped entirely when
    // every instrument in it is gated out by the risk level (crypto in a
    // conservative plan). Renormalise so the user's money is fully invested
    // rather than silently leaving a remainder in the wallet.
    const totalWeight = lines.reduce((s, l) => s + l.weight, 0);
    if (totalWeight > 0) {
        for (const l of lines) l.weight /= totalWeight;
    }

    // LARGEST-REMAINDER APPORTIONMENT.
    //
    // Rounding each line independently loses or invents paise: 3 lines of
    // 33.333% of ₹100 rounds to ₹99.99. Money must not appear or vanish, so
    // the floors are assigned first and the leftover paise handed out one at
    // a time to whichever lines were cut hardest by rounding.
    const exact = lines.map((l) => l.weight * amountPaise);
    const floors = exact.map(Math.floor);
    let remainder = amountPaise - floors.reduce((a, b) => a + b, 0);

    const order = exact
        .map((v, i) => ({ i, frac: v - Math.floor(v) }))
        .sort((a, b) => b.frac - a.frac);

    for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
        floors[order[k].i] += 1;
    }

    lines.forEach((l, i) => {
        l.paise = floors[i];
        const px = prices[l.instrument.ticker] ?? l.instrument.open;
        l.units = px > 0 ? l.paise / 100 / px : 0;
    });

    // Drop lines that rounded to nothing — a ₹0 order is not an order.
    const funded = lines.filter((l) => l.paise > 0);

    const byClassMap = new Map<AssetClass, { weight: number; paise: number }>();
    for (const l of funded) {
        const prev = byClassMap.get(l.assetClass) ?? { weight: 0, paise: 0 };
        byClassMap.set(l.assetClass, {
            weight: prev.weight + l.weight,
            paise: prev.paise + l.paise,
        });
    }

    return {
        lines: funded.sort((a, b) => b.paise - a.paise),
        totalPaise: funded.reduce((s, l) => s + l.paise, 0),
        byClass: [...byClassMap.entries()]
            .map(([assetClass, v]) => ({ assetClass, ...v }))
            .sort((a, b) => b.paise - a.paise),
        risk,
    };
}

/** Human label for an asset class. */
export const CLASS_LABEL: Record<AssetClass, string> = {
    equity: 'Shares',
    debt: 'Bonds',
    gold: 'Gold',
    crypto: 'Crypto',
    esg: 'Sustainable',
    cash: 'Cash-like',
    retirement: 'Retirement',
};

export const CLASS_COLOR: Record<AssetClass, string> = {
    equity: 'var(--accent)',
    debt: 'var(--info)',
    gold: 'var(--warn)',
    crypto: 'var(--loss)',
    esg: '#4ade80',
    cash: 'var(--text-lo)',
    retirement: '#a78bfa',
};
