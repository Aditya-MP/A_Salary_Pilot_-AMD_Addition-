import { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/cn';

/* Tab switcher with a sliding indicator. The indicator is a shared
   layoutId, so switching tabs animates the pill across rather than
   snapping — one of the cheapest "this feels smooth" wins available. */

export function Segmented<T extends string>({
    options,
    value,
    onChange,
    size = 'md',
    className,
}: {
    options: { value: T; label: string; icon?: React.ElementType }[];
    value: T;
    onChange: (v: T) => void;
    size?: 'sm' | 'md';
    className?: string;
}) {
    // Unique per instance so multiple Segmented on one page don't share
    // an indicator and fly across the screen at each other.
    const id = useId();

    return (
        <div
            className={cn(
                'inline-flex p-1 rounded-[var(--r-md)] gap-1 no-bar scroll-x',
                className
            )}
            style={{ background: 'var(--surface-3)', border: '1px solid var(--line-subtle)' }}
            role="tablist"
        >
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            'relative rounded-[var(--r-sm)] font-semibold whitespace-nowrap',
                            'flex items-center gap-1.5 transition-colors duration-150',
                            size === 'sm' ? 'px-2.5 py-1 text-[11.5px]' : 'px-3.5 py-1.5 text-[12.5px]',
                            active ? 'text-[var(--accent-ink)]' : 'text-lo hover:text-hi'
                        )}
                    >
                        {active && (
                            <motion.span
                                layoutId={`seg-${id}`}
                                className="absolute inset-0 rounded-[var(--r-sm)]"
                                style={{ background: 'var(--accent)' }}
                                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                            />
                        )}
                        {o.icon && <o.icon size={13} className="relative z-10" aria-hidden />}
                        <span className="relative z-10">{o.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
