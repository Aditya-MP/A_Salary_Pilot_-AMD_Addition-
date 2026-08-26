import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'neutral' | 'gain' | 'loss' | 'warn' | 'info' | 'accent' | 'muted';

const TONES: Record<Tone, { fg: string; bg: string; bd: string }> = {
    neutral: { fg: 'var(--text)', bg: 'rgba(255,255,255,0.05)', bd: 'var(--line)' },
    muted: { fg: 'var(--text-faint)', bg: 'transparent', bd: 'var(--line-subtle)' },
    gain: { fg: 'var(--gain)', bg: 'var(--gain-dim)', bd: 'rgba(0,232,134,0.22)' },
    loss: { fg: 'var(--loss)', bg: 'var(--loss-dim)', bd: 'rgba(255,77,109,0.22)' },
    warn: { fg: 'var(--warn)', bg: 'var(--warn-dim)', bd: 'rgba(255,176,32,0.22)' },
    info: { fg: 'var(--info)', bg: 'var(--info-dim)', bd: 'rgba(56,189,248,0.22)' },
    accent: { fg: 'var(--accent)', bg: 'var(--gain-dim)', bd: 'rgba(0,232,134,0.22)' },
};

export function Badge({
    children,
    tone = 'neutral',
    icon: Icon,
    className,
}: {
    children: ReactNode;
    tone?: Tone;
    icon?: React.ElementType;
    className?: string;
}) {
    const t = TONES[tone];
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full',
                'text-[10.5px] font-semibold tracking-wide whitespace-nowrap',
                className
            )}
            style={{ color: t.fg, background: t.bg, border: `1px solid ${t.bd}` }}
        >
            {Icon && <Icon size={11} aria-hidden />}
            {children}
        </span>
    );
}

/* A dot + label pair for chart legends and status lines. */
export function Dot({ color, label }: { color: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-lo">
            <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: color }}
                aria-hidden
            />
            {label}
        </span>
    );
}
