import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   Route transition.

   Previously navigation was a hard cut: the old page vanished and the
   new one appeared fully formed, which is the single biggest reason
   the app read as "not smooth". The fix is deliberately restrained —
   a 10px rise and a fade over 260ms. Anything showier gets tiring by
   the fifth navigation of a session.

   Note the tiny y-offset and short duration: motion should make the
   relationship between screens legible, not perform.
   ═══════════════════════════════════════════════════════════════════ */

export function PageTransition({ children }: { children: ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
            className="min-h-full min-w-0"
        >
            {children}
        </motion.div>
    );
}
