import type { Holding } from './types';
import { instrument } from './market';
import type { WalletBalance } from '../lib/wallet';

/* ═══════════════════════════════════════════════════════════════════
   Wallet positions → domain holdings.

   The bridge between the two halves of the app. The ledger knows units
   and cost in paise; the engines want a Holding with an asset class, a
   liquidity horizon and a purchase date. This translates.

   WHY THE PORTFOLIO COMES FROM HERE
   ---------------------------------
   Holdings used to be thirteen hardcoded rows in a seed file — a
   Bitcoin position, a PPF account, two single stocks — none of which
   the user had bought. Now the only way a holding exists is that the
   user actually spent wallet money on it, which is the difference
   between a portfolio screen and a screenshot.

   THE ROUNDING RULE
   -----------------
   Cost comes back as integer paise and is divided by units to recover
   an average price. Units are a decimal string, parsed only here and
   only for this. Where units are zero the position is skipped rather
   than divided by — the ledger keeps emptied accounts for their
   history, and a sold-out position is not something anyone holds.
   ═══════════════════════════════════════════════════════════════════ */

export function holdingsFromWallet(bal: WalletBalance | null): Holding[] {
    if (!bal?.holdings?.length) return [];

    const out: Holding[] = [];

    for (const pos of bal.holdings) {
        const units = Number(pos.units);
        if (!Number.isFinite(units) || units <= 0) continue;

        const meta = instrument(pos.ticker);
        const avgCost = pos.cost_paise / 100 / units;

        out.push({
            id: `w-${pos.ticker}`,
            label: meta?.label ?? pos.ticker,
            ticker: pos.ticker,
            assetClass: meta?.assetClass ?? 'equity',
            units,
            avgCost,
            // Overwritten by the live feed downstream; this is the fallback
            // for an instrument the feed has never quoted.
            price: avgCost,
            liquidity: meta?.liquidity ?? 3,
            // The ledger records when each entry was written, but a position
            // is built from many entries. Rather than invent a purchase date,
            // this uses the wallet's own last-updated stamp — the one date
            // that is actually true about the position as it stands.
            since: bal.updated_at.slice(0, 10),
            taxSection: meta?.taxSection,
        });
    }

    return out;
}
