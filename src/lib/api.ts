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

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8087';

export type Result<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; offline: boolean };

async function post<T>(path: string, body: unknown, timeoutMs = 12_000): Promise<Result<T>> {
    // AbortController rather than Promise.race: race leaves the fetch
    // running in the background, so a slow backend accumulates connections
    // nobody is waiting for.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const res = await fetch(BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { ok: false, error: text || `HTTP ${res.status}`, offline: false };
        }
        return { ok: true, data: (await res.json()) as T };
    } catch (err) {
        // A network failure and an abort are both "the backend is not
        // answering" from the user's point of view.
        const offline = err instanceof TypeError || (err as Error)?.name === 'AbortError';
        return { ok: false, error: (err as Error)?.message ?? 'request failed', offline };
    } finally {
        clearTimeout(timer);
    }
}

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
    return post<CategoriseResponse>('/v1/categorise', { transactions });
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
    // 10k paths take ~500ms server-side, so the timeout has real headroom
    // over the p99 rather than sitting just above the happy path.
    return post<SimulateResponse>('/v1/simulate', input, 20_000);
}
