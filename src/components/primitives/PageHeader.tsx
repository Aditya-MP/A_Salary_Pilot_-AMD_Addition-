import type { ReactNode } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   The component that replaces the seven full-bleed gradient banners.

   Each page previously opened with a saturated colour bar — bright
   green here, cyan-to-purple there, hot pink on Learning. They were
   the loudest element on every screen and they made the pages look
   like seven different products. This is the quiet, uniform
   alternative: eyebrow, title, one supporting line, optional live
   metric on the right, hairline underneath.
   ═══════════════════════════════════════════════════════════════════ */

export function PageHeader({
    eyebrow,
    title,
    description,
    metric,
    actions,
}: {
    eyebrow?: string;
    title: string;
    description?: string;
    /** A single headline number, right-aligned. Keep it to one. */
    metric?: { label: string; value: string; delta?: string; up?: boolean };
    actions?: ReactNode;
}) {
    return (
        <header className="pb-5 mb-6 border-b border-[var(--line-subtle)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    {eyebrow && (
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="live-dot" aria-hidden />
                            <span className="label">{eyebrow}</span>
                        </div>
                    )}
                    <h1 className="text-2xl sm:text-[28px] font-bold text-hi leading-tight">
                        {title}
                    </h1>
                    {description && (
                        <p className="text-[13px] text-lo mt-1.5 max-w-2xl">{description}</p>
                    )}
                </div>

                <div className="flex items-end gap-5 shrink-0">
                    {metric && (
                        <div className="text-right">
                            <p className="label mb-1">{metric.label}</p>
                            <p className="num text-2xl font-semibold text-hi leading-none">
                                {metric.value}
                            </p>
                            {metric.delta && (
                                <p
                                    className="num text-xs font-medium mt-1.5"
                                    style={{ color: metric.up ? 'var(--gain)' : 'var(--loss)' }}
                                >
                                    {metric.up ? '▲' : '▼'} {metric.delta}
                                </p>
                            )}
                        </div>
                    )}
                    {actions}
                </div>
            </div>
        </header>
    );
}
