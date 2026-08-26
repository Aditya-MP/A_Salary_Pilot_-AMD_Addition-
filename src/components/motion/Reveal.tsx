import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   Staggered entrance for lists and card grids.

   `Stagger` is the parent; `Item` is each child. Children arrive 45ms
   apart, which is enough for the eye to read the sequence as
   intentional and short enough that a 12-card grid still settles in
   well under a second.
   ═══════════════════════════════════════════════════════════════════ */

const container = {
    hidden: {},
    show: {
        transition: { staggerChildren: 0.045, delayChildren: 0.04 },
    },
};

const item = {
    hidden: { opacity: 0, y: 12 },
    show: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.36, ease: [0.32, 0.72, 0, 1] as const },
    },
};

export function Stagger({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className={className}
        >
            {children}
        </motion.div>
    );
}

export function Item({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <motion.div variants={item} className={className}>
            {children}
        </motion.div>
    );
}

/** Reveals on scroll instead of on mount — for content below the fold. */
export function Reveal({
    children,
    className,
    delay = 0,
}: {
    children: ReactNode;
    className?: string;
    delay?: number;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay, ease: [0.32, 0.72, 0, 1] }}
            className={className}
        >
            {children}
        </motion.div>
    );
}
