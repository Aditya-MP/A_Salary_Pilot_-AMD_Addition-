import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/* ═══════════════════════════════════════════════════════════════════
   Stat tile.

   Rules baked in so they cannot drift page to page:
   • Label above, value dominant, context below. Always that order.
   • The value is the largest thing in the tile — never the icon.
   • Direction is carried by an arrow AND the sign, never colour alone,
     so it survives colour-blindness and greyscale printing.
   • Icons are 14px and low-contrast. They orient; they don't decorate.
   ═══════════════════════════════════════════════════════════════════ */

export function Stat({
    label,
    value,
    delta,
    up,
    hint,
    icon: Icon,
    tone = 'neutral',
    className,
    footer,
}: {
    label: string;
    value: ReactNode;
    delta?: string;
    up?: boolean;
    hint?: string;
    icon?: React.ElementType;
    tone?: 'neutral' | 'gain' | 'loss' | 'warn' | 'info' | 'accent';
    className?: string;
    footer?: ReactNode;
}) {
    const toneColor = {
        neutral: 'var(--text-hi)',
        gain: 'var(--gain)',
        loss: 'var(--loss)',
        warn: 'var(--warn)',
        info: 'var(--info)',
        accent: 'var(--accent)',
    }[tone];

    return (
        <div className={cn('surface surface-interactive p-4', className)}>
            <div className="flex items-start justify-between gap-2 mb-2.5">
                <span className="label">{label}</span>
                {Icon && <Icon size={14} className="text-faint shrink-0" aria-hidden />}
            </div>

            <p
                className="num text-[22px] font-semibold leading-none tracking-tight"
                style={{ color: toneColor }}
            >
                {value}
            </p>

            {(delta || hint) && (
                <div className="flex items-baseline gap-2 mt-2 flex-wrap">
                    {delta && (
                        <span
                            className="num text-[11px] font-semibold"
                            style={{ color: up ? 'var(--gain)' : 'var(--loss)' }}
                        >
                            {up ? '▲' : '▼'} {delta}
                        </span>
                    )}
                    {hint && <span className="text-[11px] text-faint">{hint}</span>}
                </div>
            )}

            {footer && <div className="mt-3">{footer}</div>}
        </div>
    );
}
