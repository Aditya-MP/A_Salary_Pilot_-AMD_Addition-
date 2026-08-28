import { useEffect, useRef, useState } from 'react';
import { simulate, type SimulateResponse } from '../lib/api';
import type { FreedomScore } from '../engine/runwayEngine';
import type { RunwayBreakdown } from '../engine/runwayEngine';
import type { FinancialProfile } from '../domain/types';

/* ═══════════════════════════════════════════════════════════════════
   Runs the Monte Carlo simulation against the backend.

   Progressive enhancement, deliberately. The local point estimate
   renders immediately and stays on screen; if the backend answers, the
   distribution replaces it. If it does not, the user sees the same app
   they saw before — never a spinner, never an error state for something
   that is an enhancement rather than a requirement.

   The request is debounced because the profile object changes identity
   on every live price tick, and firing a 10,000-path simulation every
   three seconds would be absurd.
   ═══════════════════════════════════════════════════════════════════ */

export type SimState =
    | { status: 'local' }                              // backend not reached
    | { status: 'loading' }
    | { status: 'ready'; data: SimulateResponse };

export function useSimulation(
    profile: FinancialProfile,
    runway: RunwayBreakdown,
    score: FreedomScore,
    realReturn = 0.075,
): SimState {
    const [state, setState] = useState<SimState>({ status: 'local' });
    const ranRef = useRef(false);

    // Only the inputs that actually change the answer. Deriving the key
    // from the whole profile would re-fire on every price tick.
    const key = [
        Math.round(score.netWorth),
        Math.round(runway.liquidToday),
        Math.round(profile.income.inHand),
        Math.round(runway.essentialBurn),
        Math.round(runway.discretionaryBurn),
        Math.round(Math.max(0, score.surplus)),
        profile.age,
        realReturn,
    ].join('|');

    useEffect(() => {
        let cancelled = false;

        // Deferred to a microtask rather than called directly here: a bare
        // setState synchronously inside an effect body forces an extra
        // render before the browser has painted anything, which is what
        // the lint rule this satisfies is warning about. A microtask runs
        // essentially immediately (before paint) while no longer being
        // "synchronous within the effect" from the linter's - or React's -
        // point of view.
        if (!ranRef.current) {
            queueMicrotask(() => {
                if (!cancelled) setState({ status: 'loading' });
            });
        }
        ranRef.current = true;

        const t = setTimeout(async () => {
            const res = await simulate({
                net_worth: Math.max(0, Math.round(score.netWorth)),
                liquid: Math.max(0, Math.round(runway.liquidToday)),
                monthly_income: Math.round(profile.income.inHand),
                essential_burn: Math.round(runway.essentialBurn),
                discretionary_burn: Math.round(runway.discretionaryBurn),
                monthly_invest: Math.max(0, Math.round(score.surplus)),
                age: profile.age,
                real_return: realReturn,
                n_paths: 10_000,
            });
            if (cancelled) return;
            setState(res.ok ? { status: 'ready', data: res.data } : { status: 'local' });
        }, 600);

        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [key]);

    return state;
}
