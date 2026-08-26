/* ═══════════════════════════════════════════════════════════════════
   Formatting — Indian numbering, everywhere, consistently.
   Currency in this app is ALWAYS ₹ and always lakh/crore grouped.
   ═══════════════════════════════════════════════════════════════════ */

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/** ₹1,42,300 — full Indian grouping. */
export function money(v: number, opts: { paise?: boolean } = {}): string {
    const n = Number.isFinite(v) ? v : 0;
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    return `${sign}₹${opts.paise ? inrPaise.format(abs) : inr.format(Math.round(abs))}`;
}

/** ₹1.42L / ₹8.4Cr / ₹42.3k — for tight spaces like axis ticks and chips. */
export function moneyShort(v: number): string {
    const n = Number.isFinite(v) ? v : 0;
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1_00_00_000) return `${sign}₹${trim(abs / 1_00_00_000)}Cr`;
    if (abs >= 1_00_000) return `${sign}₹${trim(abs / 1_00_000)}L`;
    if (abs >= 1_000) return `${sign}₹${trim(abs / 1_000)}k`;
    return `${sign}₹${Math.round(abs)}`;
}

function trim(n: number): string {
    // 1.40 -> 1.4, 1.00 -> 1, 12.34 -> 12.3
    const s = n >= 10 ? n.toFixed(1) : n.toFixed(2);
    return s.replace(/\.?0+$/, '');
}

/** +2.4% / -0.8% — always signed, so direction never depends on colour alone. */
export function pct(v: number, digits = 1): string {
    const n = Number.isFinite(v) ? v : 0;
    return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

/** 61% — unsigned, for progress and shares. */
export function share(v: number, digits = 0): string {
    const n = Number.isFinite(v) ? v : 0;
    return `${n.toFixed(digits)}%`;
}

/** "4.2 months" / "1 month" / "18 days" — runway reads naturally. */
export function months(v: number): string {
    const n = Number.isFinite(v) ? Math.max(0, v) : 0;
    if (n < 1) return `${Math.round(n * 30)} days`;
    return `${n.toFixed(1)} months`;
}

/** Compact month label, e.g. "Aug '26". */
export function monthLabel(d: Date): string {
    return d
        .toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        .replace(' ', " '");
}

/** "in 7 days" / "today" / "3 days ago" */
export function relativeDays(days: number): string {
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days === -1) return 'yesterday';
    return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

/** Days remaining in the current Indian financial year (ends 31 March). */
export function daysLeftInFY(now = new Date()): number {
    const y = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
    const end = new Date(y, 2, 31, 23, 59, 59);
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
}

/** "FY26-27" for the financial year containing `now`. */
export function fyLabel(now = new Date()): string {
    const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `FY${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

/** Clamp helper used throughout the engines. */
export function clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
}
