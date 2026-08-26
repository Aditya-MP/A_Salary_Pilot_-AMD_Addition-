import { motion } from 'framer-motion';
import { type ReactNode } from 'react';
import { cn } from '../../lib/cn';

/* This was `bg-white/60` on a near-black app — a literal white panel
   at 60% opacity, which is exactly the washed-out look that needed
   fixing. It now uses the same surface treatment as everything else. */

export const GlassCard = ({
    children,
    className = '',
    hoverEffect = true,
    delay = 0,
}: {
    children: ReactNode;
    className?: string;
    hoverEffect?: boolean;
    delay?: number;
}) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5, delay, ease: [0.32, 0.72, 0, 1] }}
        whileHover={hoverEffect ? { y: -4, transition: { duration: 0.25 } } : undefined}
        className={cn('surface p-6', className)}
    >
        {children}
    </motion.div>
);
