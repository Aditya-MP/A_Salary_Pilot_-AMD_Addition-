import { useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useWalletStore } from '../store/useWalletStore';
import { holdingsFromWallet } from '../domain/fromWallet';
import { hasFinancialData } from '../domain/empty';
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

   HOLDINGS COME FROM THE WALLET
   -----------------------------
   Not from a seed file. The only holdings that exist are the ones the
   user actually bought with wallet money, and the wallet balance is
   liquid savings like any other cash. That is what makes the numbers
   on every screen the user's own rather than a fixture's.

   `ready` reports whether there is enough input to say anything true.
   Screens check it instead of rendering a confident zero — a fresh
   account showing "0.0 months · critical" is not an empty state, it is
   the app telling a new user they are broke.
   ═══════════════════════════════════════════════════════════════════ */

export function useFinancials() {
    const profile = useAppStore((s) => s.profile);
    const split = useAppStore((s) => s.split);
    const prices = useLivePrices();

    const walletBalance = useWalletStore((s) => s.balance);
    const refreshWallet = useWalletStore((s) => s.refresh);

    // One fetch shared by every screen; the store single-flights it.
    useEffect(() => {
        void refreshWallet();
    }, [refreshWallet]);

    return useMemo(() => {
        const walletHoldings = holdingsFromWallet(walletBalance);

        // Wallet cash is spendable today, so it is part of the runway the
        // same way a savings balance is. Simulated, and labelled as such
        // wherever it is shown.
        const merged = {
            ...profile,
            cash: profile.cash + (walletBalance?.wallet_paise ?? 0) / 100,
            holdings: [...profile.holdings, ...walletHoldings],
        };

        // Overlay live prices onto the holdings.
        const priced = {
            ...merged,
            holdings: priceHoldings(merged.holdings, prices),
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
            /** Enough inputs to say something true? */
            ready: hasFinancialData(priced),
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
    }, [profile, split.investments, prices, walletBalance]);
}
