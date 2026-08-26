import { useEffect, useRef, useState } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   A value that eases toward its target instead of snapping.

   Three details that matter and are usually got wrong:

   1. requestAnimationFrame with an eased curve, not setInterval with a
      fixed step. The old landing-page counter ticked every 16ms via
      setInterval, which drifts and stutters under load.

   2. It only animates when the value changes by a meaningful amount.
      Live prices tick every three seconds; re-running a 900ms count-up
      on a ₹3 move would leave the digits permanently in motion, which
      reads as broken rather than alive.

   3. Small deltas are applied on the next animation frame rather than
      synchronously inside the effect, so a three-second price tick does
      not queue an extra render pass.
   ═══════════════════════════════════════════════════════════════════ */

export function useAnimatedValue(target: number, duration = 900) {
    const [display, setDisplay] = useState(target);
    const fromRef = useRef(target);
    const rafRef = useRef(0);

    useEffect(() => {
        const from = fromRef.current;
        const relative = Math.abs(from) > 0 ? Math.abs(target - from) / Math.abs(from) : 1;

        // Under 2% is live-data jitter, not a new fact worth animating.
        // Applied on the next frame rather than synchronously, so a price
        // tick does not queue an extra render pass inside the effect.
        if (relative < 0.02) {
            fromRef.current = target;
            const id = requestAnimationFrame(() => setDisplay(target));
            return () => cancelAnimationFrame(id);
        }

        const start = performance.now();

        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            // easeOutExpo — fast start, long settle. Reads as "landing".
            const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            setDisplay(from + (target - from) * eased);
            if (t < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                fromRef.current = target;
            }
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [target, duration]);

    return display;
}
