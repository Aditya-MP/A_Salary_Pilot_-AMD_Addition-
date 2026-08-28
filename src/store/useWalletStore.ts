import { create } from 'zustand';
import {
    getWallet, getHistory,
    type WalletBalance, type LedgerEntry,
} from '../lib/wallet';

/* ═══════════════════════════════════════════════════════════════════
   The wallet, shared.

   WHY A STORE AND NOT LOCAL STATE IN THE WALLET PAGE
   --------------------------------------------------
   The wallet is no longer just one screen's concern. It is now the
   only source of the user's actual holdings, so the dashboard, the
   portfolio and the runway calculation all need it. If each fetched
   independently they would drift apart within seconds of a trade —
   the same class of bug the price feed already had, where Dashboard
   and Portfolio showed different prices for one holding.

   One fetch, one copy, every screen agreeing.

   DELIBERATELY NOT PERSISTED
   --------------------------
   A balance cached in localStorage is a balance that can be stale or
   forged. The ledger on the server is the only authority; this is a
   view of it that dies with the tab.
   ═══════════════════════════════════════════════════════════════════ */

interface WalletState {
    balance: WalletBalance | null;
    entries: LedgerEntry[];
    /** null until the first attempt resolves. */
    loaded: boolean;
    offline: boolean;

    refresh: () => Promise<void>;
    /** Drops everything on sign-out, so the next user starts blank. */
    clear: () => void;
}

let inFlight: Promise<void> | null = null;

export const useWalletStore = create<WalletState>()((set) => ({
    balance: null,
    entries: [],
    loaded: false,
    offline: false,

    refresh: async () => {
        // Single-flight. Three screens mounting at once should produce one
        // pair of requests, not three.
        if (inFlight) return inFlight;

        inFlight = (async () => {
            try {
                const [w, h] = await Promise.all([getWallet(), getHistory()]);

                if (w.ok) {
                    set({ balance: w.data, offline: false, loaded: true });
                } else {
                    // Keep the last known balance when the network drops. A
                    // wallet that blanks to ₹0 on a flaky connection reads as
                    // "your money is gone", which is worse than stale.
                    set({ offline: w.offline, loaded: true });
                }
                if (h.ok) set({ entries: h.data.entries });
            } finally {
                inFlight = null;
            }
        })();

        return inFlight;
    },

    clear: () => set({ balance: null, entries: [], loaded: false, offline: false }),
}));
