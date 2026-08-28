/* ═══════════════════════════════════════════════════════════════════
   Backend client.

   Until now the frontend computed everything locally from a seed file
   and never spoke to a server. These are the first real calls.

   Two rules the whole client follows:

   1. THE APP MUST WORK WITH THE BACKEND DOWN. Every call returns a
      discriminated result rather than throwing, and every caller has a
      local fallback. A portfolio app that shows a spinner forever
      because a laptop service is not running is worse than one that
      quietly computes locally.

   2. NULL MEANS SOMETHING. The simulator returns null percentiles when
      more than that share of paths never reach financial independence.
      "never" is a real outcome and must survive the wire as null, not
      be coerced to 0 and rendered as a year.
   ═══════════════════════════════════════════════════════════════════ */

import { authed } from './session';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8087';

export type Result<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; offline: boolean };

export async function health(): Promise<boolean> {
    try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch(BASE + '/healthz', { signal: ctrl.signal });
        return res.ok;
    } catch {
        return false;
    }
}

/* ─── M1 · categorise ─────────────────────────────────────────────── */

export interface TxnInput {
    narration: string;
    amount: number;
    channel: string;
    direction: 'debit' | 'credit';
    day?: string;
}

export interface Prediction {
    category: string;
    confidence: number;
    alternatives: { category: string; probability: number }[];
    model_version: string;
}

export interface CategoriseResponse {
    results: Prediction[];
    model_version?: string;
    latency_ms?: number;
    caveat?: string;
    degraded?: boolean;
    reason?: string;
}

export function categorise(transactions: TxnInput[]) {
    // Goes through authed(), not the local post() above - this endpoint is
    // gated behind login server-side (see internal/rpc/server.go), because
    // an unauthenticated categorisation/simulation endpoint on a hosted
    // deployment is just free compute for anyone who finds the URL. Every
    // caller of this function already runs on a page the route guard in
    // App.tsx has already put behind a signed-in session, so this costs
    // nothing in practice and closes a real gap.
    return authed<CategoriseResponse>('/v1/categorise', {
        method: 'POST',
        body: JSON.stringify({ transactions }),
    });
}

/* ─── M6 · simulate ───────────────────────────────────────────────── */

export interface SimulateInput {
    net_worth: number;
    liquid: number;
    monthly_income: number;
    essential_burn: number;
    discretionary_burn: number;
    monthly_invest: number;
    age: number;
    horizon_years?: number;
    real_return?: number;
    n_paths?: number;
}

export interface SimulateResponse {
    /** null means more than that share of paths never reach FI. */
    freedom_age: {
        p10: number | null;
        p25: number | null;
        p50: number | null;
        p75: number | null;
        p90: number | null;
    };
    probability_reaching_fi: number;
    probability_by_age: Record<string, number>;
    probability_never_running_out: number;
    assumptions: Record<string, unknown>;
    n_paths: number;
    model_version: string;
    latency_ms: number;
}

export function simulate(input: SimulateInput) {
    // Also gated server-side now - see the note on categorise() above.
    return authed<SimulateResponse>('/v1/simulate', {
        method: 'POST',
        body: JSON.stringify(input),
    }, 20_000);
}
