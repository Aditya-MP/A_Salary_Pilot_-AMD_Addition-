import { motion } from 'framer-motion';
import { type ReactNode } from 'react';

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    hoverEffect?: boolean;
    delay?: number;
}

export const GlassCard = ({ children, className = '', hoverEffect = true, delay = 0 }: GlassCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
            whileHover={hoverEffect ? {
                y: -8,
                transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] }
            } : {}}
            className={`glass-card gradient-border p-6 bg-white/60 backdrop-blur-xl rounded-2xl ${className}`}
        >
            {children}
        </motion.div>
    );
};
