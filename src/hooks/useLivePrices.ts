import { useSyncExternalStore } from 'react';
import { seedProfile } from '../domain/seed';

/* ═══════════════════════════════════════════════════════════════════
   Live price feed — one ticker for the whole app.

   Three real bugs in the previous version, all fixed here:

   1. Every page called useLivePrices() separately, so each mounted its
      own interval with its own random walk. Dashboard and Portfolio
      would show different prices for the same holding at the same
      moment — the fastest way to destroy trust in a finance app.

   2. `setChanges` was called from inside the `setPrices` updater. React
      state updaters must be pure; under StrictMode that fires twice and
      double-steps the walk.

   3. The effect closed over `changes` with a `[]` dependency array, so
      it read a permanently stale value.

   This is a single module-level store driven by one interval, consumed
   through useSyncExternalStore. Every subscriber sees identical prices.
   ═══════════════════════════════════════════════════════════════════ */

export interface PriceSnapshot {
    /** ticker → current price */
    price: Record<string, number>;
    /** ticker → % change from session open */
    change: Record<string, number>;
    /** Market-wide index level, for the ticker strip. */
    nifty: number;
    niftyChange: number;
    updatedAt: number;
}

/* Per-asset-class daily volatility, roughly calibrated to reality.
   Crypto genuinely does move ~40x more than a liquid fund; using one
   volatility for everything made the old feed look fake. */
const VOL: Record<string, number> = {
    equity: 0.0035,
    esg: 0.003,
    debt: 0.0004,
    gold: 0.0018,
    crypto: 0.014,
    cash: 0.0001,
    retirement: 0.0002,
};

const OPEN: Record<string, number> = {};
const CLASS_OF: Record<string, string> = {};

seedProfile.holdings.forEach((h) => {
    OPEN[h.ticker] = h.price;
    CLASS_OF[h.ticker] = h.assetClass;
});

let snapshot: PriceSnapshot = {
    price: { ...OPEN },
    change: Object.fromEntries(Object.keys(OPEN).map((k) => [k, 0])),
    nifty: 24_812,
    niftyChange: 0,
    updatedAt: Date.now(),
};

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
    const price: Record<string, number> = {};
    const change: Record<string, number> = {};

    // A shared market factor so holdings move together the way real
    // markets do, plus idiosyncratic noise per instrument. Independent
    // random walks look wrong to anyone who has watched a real portfolio.
    const market = (Math.random() - 0.5) * 0.004;

    for (const ticker of Object.keys(OPEN)) {
        const vol = VOL[CLASS_OF[ticker]] ?? 0.003;
        const beta = CLASS_OF[ticker] === 'crypto' ? 0.3 : 0.75;
        const drift = market * beta + (Math.random() - 0.5) * 2 * vol;

        const next = snapshot.price[ticker] * (1 + drift);
        price[ticker] = next;
        change[ticker] = ((next - OPEN[ticker]) / OPEN[ticker]) * 100;
    }

    const nifty = snapshot.nifty * (1 + market);

    snapshot = {
        price,
        change,
        nifty,
        niftyChange: ((nifty - 24_812) / 24_812) * 100,
        updatedAt: Date.now(),
    };

    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (!timer) timer = setInterval(tick, 3_000);

    return () => {
        listeners.delete(listener);
        // Stop the clock when nothing is watching — no background work
        // on a page the user has navigated away from.
        if (listeners.size === 0 && timer) {
            clearInterval(timer);
            timer = null;
        }
    };
}

const getSnapshot = () => snapshot;

export function useLivePrices(): PriceSnapshot {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Prices merged onto a holdings array — the usual consumer shape. */
export function priceHoldings<T extends { ticker: string; price: number }>(
    holdings: T[],
    snap: PriceSnapshot
): T[] {
    return holdings.map((h) => ({ ...h, price: snap.price[h.ticker] ?? h.price }));
}
