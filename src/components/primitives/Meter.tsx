import { cn } from '../../lib/cn';

/* ═══════════════════════════════════════════════════════════════════
   Meter — one progress bar for the whole app.

   Every page had its own hand-rolled `h-2 rounded-full` div with a
   different glow. This is the single implementation, with an optional
   target marker, which turns "61% filled" into "61% filled, and here
   is where you should be" — a far more useful bar.
   ═══════════════════════════════════════════════════════════════════ */

export function Meter({
    value,
    max = 100,
    /** Draws a tick at this value — the "you should be here" line. */
    target,
    color = 'var(--accent)',
    height = 8,
    className,
    label,
    trailing,
    animate = true,
}: {
    value: number;
    max?: number;
    target?: number;
    color?: string;
    height?: number;
    className?: string;
    label?: string;
    trailing?: string;
    animate?: boolean;
}) {
    const pctRaw = max > 0 ? (value / max) * 100 : 0;
    const pct = Math.min(100, Math.max(0, pctRaw));
    const targetPct =
        target != null && max > 0 ? Math.min(100, Math.max(0, (target / max) * 100)) : null;

    return (
        <div className={className}>
            {(label || trailing) && (
                <div className="flex items-baseline justify-between mb-1.5 gap-3">
                    {label && <span className="text-[12px] text-lo truncate">{label}</span>}
                    {trailing && (
                        <span className="num text-[12px] font-semibold text-hi shrink-0">
                            {trailing}
                        </span>
                    )}
                </div>
            )}

            <div
                className="relative w-full rounded-full overflow-hidden"
                style={{ height, background: 'rgba(255,255,255,0.06)' }}
                role="progressbar"
                aria-valuenow={Math.round(pctRaw)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={label}
            >
                <div
                    className={cn('h-full rounded-full', animate && 'transition-[width]')}
                    style={{
                        width: `${pct}%`,
                        background: color,
                        transitionDuration: animate ? '700ms' : '0ms',
                        transitionTimingFunction: 'cubic-bezier(0.32,0.72,0,1)',
                    }}
                />

                {targetPct != null && (
                    <div
                        className="absolute top-0 bottom-0 w-px"
                        style={{
                            left: `${targetPct}%`,
                            background: 'var(--text-hi)',
                            opacity: 0.55,
                        }}
                        aria-hidden
                    />
                )}
            </div>
        </div>
    );
}

/* ─── Segmented meter: several parts of one whole in a single bar.
       Used for allocation and the payday split. ─── */

export function StackedMeter({
    segments,
    height = 10,
    className,
}: {
    segments: { label: string; value: number; color: string }[];
    height?: number;
    className?: string;
}) {
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;

    return (
        <div
            className={cn('flex w-full rounded-full overflow-hidden', className)}
            style={{ height, background: 'rgba(255,255,255,0.06)' }}
        >
            {segments.map((s, i) => (
                <div
                    key={s.label}
                    title={`${s.label} · ${((s.value / total) * 100).toFixed(1)}%`}
                    className="h-full transition-[width] duration-700 ease-smooth"
                    style={{
                        width: `${(s.value / total) * 100}%`,
                        background: s.color,
                        marginLeft: i === 0 ? 0 : 1,
                    }}
                />
            ))}
        </div>
    );
}
