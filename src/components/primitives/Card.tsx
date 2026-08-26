import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/* One card treatment for the entire app. Previously every page invented
   its own bordered box with a different coloured glow, which is why the
   screens never felt related. */

export function Card({
    children,
    className,
    interactive = false,
    as: Tag = 'div',
}: {
    children: ReactNode;
    className?: string;
    interactive?: boolean;
    as?: 'div' | 'section' | 'article';
}) {
    return (
        <Tag
            className={cn(
                'surface overflow-hidden',
                interactive && 'surface-interactive cursor-pointer',
                className
            )}
        >
            {children}
        </Tag>
    );
}

export function CardHead({
    icon: Icon,
    title,
    subtitle,
    action,
    accent = 'var(--text-lo)',
}: {
    icon?: React.ElementType;
    title: string;
    subtitle?: string;
    action?: ReactNode;
    accent?: string;
}) {
    return (
        <div className="card-head justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
                {Icon && (
                    <Icon size={15} style={{ color: accent }} className="shrink-0" aria-hidden />
                )}
                <div className="min-w-0">
                    <h3 className="text-[13px] font-semibold text-hi truncate">{title}</h3>
                    {subtitle && (
                        <p className="text-[11px] text-faint truncate mt-px">{subtitle}</p>
                    )}
                </div>
            </div>
            {action && <div className="shrink-0 ml-3">{action}</div>}
        </div>
    );
}

export function CardBody({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return <div className={cn('p-4 sm:p-5', className)}>{children}</div>;
}
