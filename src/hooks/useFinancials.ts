import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useLivePrices, priceHoldings } from './useLivePrices';
import { computeRunway, computeFreedomScore, computeLevers, projectRunway } from '../engine/runwayEngine';
import { summarisePortfolio } from '../engine/portfolioEngine';
import { findLeaks, planPayday } from '../engine/leakEngine';
import { compareRegimes, computeHeadroom } from '../engine/regimeEngine';

/* ═══════════════════════════════════════════════════════════════════
   One hook that derives the entire financial picture from the profile
   plus live prices. Every page pulls what it needs from here, so no
   screen can disagree with another about the user's own numbers.

   Everything is memoised on the profile identity and the price
   timestamp, so a 3-second tick recomputes the maths once rather than
   once per component.
   ═══════════════════════════════════════════════════════════════════ */

export function useFinancials() {
    const profile = useAppStore((s) => s.profile);
    const split = useAppStore((s) => s.split);
    const prices = useLivePrices();

    return useMemo(() => {
        // Overlay live prices onto the stored holdings.
        const priced = {
            ...profile,
            holdings: priceHoldings(profile.holdings, prices),
        };

        const runway = computeRunway(priced);
        const score = computeFreedomScore(priced, runway);
        const levers = computeLevers(priced, runway, score);
        const portfolio = summarisePortfolio(priced);
        const leaks = findLeaks(priced);
        const payday = planPayday(priced, split.investments);
        const regimes = compareRegimes(priced);
        const headroom = computeHeadroom(priced);
        const projection = projectRunway(runway);

        return {
            profile: priced,
            runway,
            score,
            levers,
            portfolio,
            leaks,
            payday,
            regimes,
            headroom,
            projection,
            prices,
        };
    }, [profile, split.investments, prices]);
}
