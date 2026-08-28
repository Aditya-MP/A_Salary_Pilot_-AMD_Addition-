/* ═══════════════════════════════════════════════════════════════════
   Wallet client.

   ⚠  SIMULATED MONEY. No real funds move. Every screen that spends
      says so; see backend/db/migrations/004_wallet.sql for why.

   TWO REPRESENTATION RULES, BOTH LOAD-BEARING
   -------------------------------------------

   PAISE, NOT RUPEES. Money crosses the wire as whole paise in a
   number. JavaScript numbers are IEEE-754 doubles, which cannot
   represent 0.1 — 0.1 + 0.2 is famously 0.30000000000000004. Integer
   paise are exact up to 2^53, which is ₹90 trillion, so the arithmetic
   is exact everywhere it matters. Rupees appear only at the moment of
   display.

   UNITS ARE STRINGS. The server sends NUMERIC(24,10) as a JSON string
   on purpose. Parsing 11.4942528736 into a double loses digits, and
   quantities of an instrument are exactly the thing that must not
   silently drift. So the string is kept, and Number() is applied only
   for formatting.
   ═══════════════════════════════════════════════════════════════════ */

import { authed, type Result } from './session';

export interface Position {
    ticker: string;
    cost_paise: number;
    /** Decimal string. Do not do arithmetic on the parsed number. */
    units: string;
}

export interface WalletBalance {
    wallet_paise: number;
    invested_paise: number;
    holdings: Position[];
    updated_at: string;
}

export interface LedgerEntry {
    txn_id: string;
    kind: 'topup' | 'invest' | 'redeem' | 'withdraw' | 'fee';
    memo: string;
    amount_paise: number;
    account: string;
    ticker?: string;
    created_at: string;
}

export interface MoneyResult {
    transaction_id: string;
    simulated: boolean;
}

export function getWallet(): Promise<Result<WalletBalance>> {
    return authed<WalletBalance>('/v1/wallet');
}

export function getHistory(): Promise<Result<{ entries: LedgerEntry[] }>> {
    return authed<{ entries: LedgerEntry[] }>('/v1/wallet/history');
}

/* ─── idempotency ─────────────────────────────────────────────────── */

/**
 * A key for one user intent, generated when the form is submitted.
 *
 * This is the client half of the double-spend guard. The server refuses
 * to move money twice for the same key, so a double tap, a retry after a
 * dropped connection, or an impatient reload all collapse into a single
 * transaction — but only if the key stays the same across those retries.
 * Generating it inside the request function instead would defeat the
 * whole mechanism: every retry would carry a fresh key and look like a
 * brand new payment.
 */
export function newIdempotencyKey(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/* ─── the money endpoints ─────────────────────────────────────────── */

export function topUp(paise: number, key: string, memo = 'Wallet top-up') {
    return authed<MoneyResult>('/v1/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({ amount_paise: paise, idempotency_key: key, memo }),
    });
}

export function withdraw(paise: number, key: string, memo = 'Withdrawal') {
    return authed<MoneyResult>('/v1/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount_paise: paise, idempotency_key: key, memo }),
    });
}

export function invest(
    ticker: string,
    paise: number,
    unitPricePaise: number,
    key: string,
    memo = '',
) {
    return authed<MoneyResult>('/v1/wallet/invest', {
        method: 'POST',
        body: JSON.stringify({
            ticker,
            amount_paise: paise,
            unit_price_paise: unitPricePaise,
            idempotency_key: key,
            memo,
        }),
    });
}

export function redeem(
    ticker: string,
    paise: number,
    unitPricePaise: number,
    key: string,
    memo = '',
) {
    return authed<MoneyResult>('/v1/wallet/redeem', {
        method: 'POST',
        body: JSON.stringify({
            ticker,
            amount_paise: paise,
            unit_price_paise: unitPricePaise,
            idempotency_key: key,
            memo,
        }),
    });
}

/* ─── display helpers ─────────────────────────────────────────────── */

export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const toRupees = (paise: number) => paise / 100;

/** ₹1,23,456 — Indian digit grouping, no decimals. */
export function formatPaise(paise: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(paise / 100);
}

/** Trims the trailing zeros off NUMERIC(24,10) so the UI shows 11.4943. */
export function formatUnits(units: string, dp = 4): string {
    const n = Number(units);
    if (!Number.isFinite(n)) return units;
    return n.toFixed(dp).replace(/\.?0+$/, '');
}

/* ─── M5 · allocation ─────────────────────────────────────────────── */

export interface AllocateResponse {
    model_version: string;
    risk_profile: string;
    growth_tilt: number;
    weights: Record<string, number>;
    expected_annual_volatility: number;
    equal_weight_volatility: number;
    max_single_asset_weight: number;
    evidence: {
        data_source: string;
        n_quarters: number;
        evaluation_window: { start: string; end: string };
        volatility_reduction_pct: number;
        drawdown_reduction_pct: number;
        annual_return: number;
        benchmark_annual_return: number;
        benchmark: string;
        /** Whether this allocation actually out-earned the benchmark in the
            real evaluation — read this instead of assuming a direction. */
        beats_benchmark_return: boolean;
    };
    caveat: string;
    /** Present only when today's real market conditions have inverted the
        usual risk ordering (e.g. a volatility spike in one asset made
        "conservative" numerically rougher than "balanced"). Null otherwise. */
    ordering_note: string | null;
    latency_ms: number;
}

export function allocate(riskProfile: string) {
    return authed<AllocateResponse>('/v1/allocate', {
        method: 'POST',
        body: JSON.stringify({ risk_profile: riskProfile }),
    });
}
