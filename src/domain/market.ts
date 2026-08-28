import type { AssetClass, Liquidity, TaxSection } from './types';

/* ═══════════════════════════════════════════════════════════════════
   The investable universe.

   WHY THIS FILE EXISTS
   --------------------
   The price feed used to build its ticker list from seedProfile.holdings
   — one fictional user's portfolio. That coupling is backwards twice
   over: a real user could only be quoted prices for instruments the demo
   person happened to own, and deleting the fake user broke the market.
   Instrument definitions are market data: the same for everyone, present
   whether or not anyone holds them.

   ─────────────────────────────────────────────────────────────────
   THE IMPORTANT DECISION IN THIS FILE: `autoAllocate`
   ─────────────────────────────────────────────────────────────────
   The product promise is that somebody who does not know how to invest
   can hand over money and have the system place it well. That raises an
   obvious question — should the system pick individual shares?

   No, and the reason is not caution, it is honesty about what is
   knowable here. Choosing between Reliance and TCS on the user's behalf
   requires company fundamentals: earnings quality, debt cover,
   governance, competitive position. This app has none of that data. A
   "quality score" computed without it would be a number invented to look
   like analysis, which is precisely the kind of fake data this app is
   being purged of.

   What IS defensible without fundamentals is diversification. A broad
   index cannot go to zero the way a single company can — that is a
   structural property, not a forecast, and it happens to be what the
   evidence supports for non-expert investors anyway. So:

     autoAllocate: true   diversified funds. The plan engine may buy these.
     autoAllocate: false  single companies and locked instruments. Available
                          to buy by hand, never chosen on the user's behalf.

   Anyone who wants to pick Reliance can. The system just will not pretend
   it knows that Reliance is the right answer.

   PRICES
   ------
   Opening marks for the session, in rupees, at plausible levels. The feed
   walks them from here. This is a simulated market and every screen that
   shows a price says so.
   ═══════════════════════════════════════════════════════════════════ */

export interface Instrument {
    ticker: string;
    label: string;
    assetClass: AssetClass;
    /** Session opening price per unit, in rupees. */
    open: number;
    /** Days to convert to cash. 9999 = locked. */
    liquidity: Liquidity;
    /** One line on what this is, shown on the buy screen. */
    blurb: string;
    /** Why the plan engine may or may not choose it. Shown in the UI. */
    rationale: string;
    /** May the automatic plan buy this? See the note above. */
    autoAllocate: boolean;
    /** Offered on the manual buy screen at all. */
    tradeable: boolean;
    taxSection?: TaxSection;
    lockInYears?: number;
    /** Roughly how many underlying companies/assets sit behind it. */
    holdings?: number;
}

export const INSTRUMENTS: Instrument[] = [
    /* ─── Indian equity — broad, diversified ───────────────────────── */
    {
        ticker: 'NIFTY50', label: 'Nifty 50 Index Fund', assetClass: 'equity',
        open: 261, liquidity: 3, holdings: 50,
        blurb: 'The 50 largest listed Indian companies.',
        rationale: 'The default core holding. If any one company fails, it is at most a few percent of the fund.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'NEXT50', label: 'Nifty Next 50 Index Fund', assetClass: 'equity',
        open: 187, liquidity: 3, holdings: 50,
        blurb: 'The 50 companies just below the top 50.',
        rationale: 'Tomorrow’s large caps. Higher growth, noticeably rougher ride.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'MIDCAP150', label: 'Nifty Midcap 150 Fund', assetClass: 'equity',
        open: 148, liquidity: 3, holdings: 150,
        blurb: 'Mid-sized Indian companies.',
        rationale: 'Historically the strongest long-run returns and the deepest drawdowns. Diversified across 150 names.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'SMALLCAP250', label: 'Nifty Smallcap 250 Fund', assetClass: 'equity',
        open: 112, liquidity: 3, holdings: 250,
        blurb: 'Small Indian companies.',
        rationale: 'Genuinely volatile. Included for aggressive plans only, and never in size.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'FLEXICAP', label: 'Flexi Cap Fund', assetClass: 'equity',
        open: 79, liquidity: 3, holdings: 60,
        blurb: 'Actively managed across company sizes.',
        rationale: 'A manager decides the size mix. Costs more than an index; sometimes earns it.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'ELSS', label: 'ELSS Tax Saver Fund', assetClass: 'equity',
        open: 46, liquidity: 9999, holdings: 45,
        blurb: 'Equity that also fills your 80C deduction.',
        rationale: 'Locked for three years — genuinely locked. Excluded from automatic plans because money you cannot reach is not an emergency buffer.',
        autoAllocate: false, tradeable: true,
        taxSection: '80C', lockInYears: 3,
    },

    /* ─── International ─────────────────────────────────────────────── */
    {
        ticker: 'SP500', label: 'S&P 500 Index Fund', assetClass: 'equity',
        open: 74, liquidity: 3, holdings: 500,
        blurb: 'The 500 largest US companies.',
        rationale: 'Currency and geography diversification. When India has a bad decade, this usually does not.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'NASDAQ100', label: 'Nasdaq 100 Fund', assetClass: 'equity',
        open: 168, liquidity: 3, holdings: 100,
        blurb: 'The 100 largest US non-financial companies, technology-heavy.',
        rationale: 'Concentrated in one sector. Diversified by company, not by industry.',
        autoAllocate: true, tradeable: true,
    },

    /* ─── Sustainability ────────────────────────────────────────────── */
    {
        ticker: 'NIFTYESG', label: 'Nifty 100 ESG Index Fund', assetClass: 'esg',
        open: 44, liquidity: 3, holdings: 85,
        blurb: 'Screens out tobacco, weapons, and heavy polluters.',
        rationale: 'Same broad Indian market, filtered on environmental and governance scores. Governance screening also tends to exclude the companies most likely to blow up.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'GREENENERGY', label: 'Nifty Clean Energy Fund', assetClass: 'esg',
        open: 58, liquidity: 3, holdings: 30,
        blurb: 'Renewables, grid and electric transport.',
        rationale: 'A sector bet, not a diversified holding. Available by hand; never auto-allocated in size.',
        autoAllocate: false, tradeable: true,
    },

    /* ─── Debt ──────────────────────────────────────────────────────── */
    {
        ticker: 'LIQUIDBEES', label: 'Liquid Fund', assetClass: 'cash',
        open: 1_000, liquidity: 1, holdings: 40,
        blurb: 'Near-cash. Redeemable next working day.',
        rationale: 'Where an emergency fund should actually sit — earns more than a savings account with almost no price risk.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'CORPBOND', label: 'Corporate Bond Fund', assetClass: 'debt',
        open: 61, liquidity: 3, holdings: 120,
        blurb: 'Lends to large, highly-rated companies.',
        rationale: 'The ballast. Steadier than equity, beats a savings account, and moves differently from shares when markets fall.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'GILT10', label: 'Government Bond Fund (10yr)', assetClass: 'debt',
        open: 54, liquidity: 3,
        blurb: 'Lends to the Government of India.',
        rationale: 'Effectively no default risk in rupees. Price still moves with interest rates.',
        autoAllocate: true, tradeable: true,
    },

    /* ─── Commodities ───────────────────────────────────────────────── */
    {
        ticker: 'GOLDBEES', label: 'Gold ETF', assetClass: 'gold',
        open: 66, liquidity: 3,
        blurb: 'Gold, without a locker or making charges.',
        rationale: 'Tends to hold up when equity does not, and hedges a falling rupee. Earns nothing on its own.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'SILVERBEES', label: 'Silver ETF', assetClass: 'gold',
        open: 92, liquidity: 3,
        blurb: 'Silver, half precious metal and half industrial input.',
        rationale: 'More volatile than gold and more tied to the industrial cycle.',
        autoAllocate: false, tradeable: true,
    },

    /* ─── Crypto ────────────────────────────────────────────────────── */
    {
        ticker: 'BTC', label: 'Bitcoin', assetClass: 'crypto',
        open: 52_80_000, liquidity: 1,
        blurb: 'The largest cryptocurrency by value.',
        rationale: 'Capped in every plan. Volatile enough to ruin a runway — size it like a bet, not a plan.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'ETH', label: 'Ethereum', assetClass: 'crypto',
        open: 1_96_000, liquidity: 1,
        blurb: 'The largest smart-contract platform.',
        rationale: 'Correlated with Bitcoin, and most strongly at exactly the moments diversification is supposed to help.',
        autoAllocate: true, tradeable: true,
    },
    {
        ticker: 'ADA', label: 'Cardano', assetClass: 'crypto',
        open: 62, liquidity: 1,
        blurb: 'A smaller smart-contract platform.',
        rationale: 'Far smaller and thinner than Bitcoin or Ethereum. Available by hand; not auto-allocated.',
        autoAllocate: false, tradeable: true,
    },
    {
        ticker: 'SOL', label: 'Solana', assetClass: 'crypto',
        open: 15_400, liquidity: 1,
        blurb: 'A high-throughput smart-contract platform.',
        rationale: 'As above. Higher volatility again, and a shorter history to judge it on.',
        autoAllocate: false, tradeable: true,
    },

    /* ─── Individual companies ──────────────────────────────────────
       Buyable by hand. Never chosen by the plan engine, because doing
       so would require fundamentals this app does not have. See the
       note at the top of this file. */
    {
        ticker: 'RELIANCE', label: 'Reliance Industries', assetClass: 'equity',
        open: 2_712, liquidity: 1,
        blurb: 'Energy, retail and telecom conglomerate.',
        rationale: 'A single company. Your money rises or falls with one management team’s decisions.',
        autoAllocate: false, tradeable: true,
    },
    {
        ticker: 'TCS', label: 'Tata Consultancy Services', assetClass: 'equity',
        open: 4_120, liquidity: 1,
        blurb: 'India’s largest IT services company.',
        rationale: 'A single company, and one exposed to a single client geography.',
        autoAllocate: false, tradeable: true,
    },
    {
        ticker: 'HDFCBANK', label: 'HDFC Bank', assetClass: 'equity',
        open: 1_558, liquidity: 1,
        blurb: 'India’s largest private bank.',
        rationale: 'A single company. Banks in particular carry risks that are invisible until they are not.',
        autoAllocate: false, tradeable: true,
    },
    {
        ticker: 'INFY', label: 'Infosys', assetClass: 'equity',
        open: 1_845, liquidity: 1,
        blurb: 'IT services and consulting.',
        rationale: 'A single company.',
        autoAllocate: false, tradeable: true,
    },
    {
        ticker: 'ICICIBANK', label: 'ICICI Bank', assetClass: 'equity',
        open: 1_246, liquidity: 1,
        blurb: 'Private sector bank.',
        rationale: 'A single company.',
        autoAllocate: false, tradeable: true,
    },
    {
        ticker: 'ITC', label: 'ITC Limited', assetClass: 'equity',
        open: 462, liquidity: 1,
        blurb: 'Cigarettes, packaged foods, hotels and paper.',
        rationale: 'A single company, and one excluded by most ESG screens.',
        autoAllocate: false, tradeable: true,
    },

    /* ─── Held, not bought here ─────────────────────────────────────
       Payroll and government instruments. A user can have them; nobody
       buys them through an app screen. Listed so a balance can be
       priced and shown. */
    {
        ticker: 'PPF', label: 'PPF Account', assetClass: 'retirement',
        open: 1, liquidity: 9999,
        blurb: 'Public Provident Fund. 15-year lock, returns tax-free.',
        rationale: 'Opened at a bank or post office, not here.',
        autoAllocate: false, tradeable: false, taxSection: '80C',
    },
    {
        ticker: 'NPS', label: 'NPS Tier-I', assetClass: 'retirement',
        open: 1, liquidity: 9999,
        blurb: 'National Pension System. Locked until 60.',
        rationale: 'The only route to the extra ₹50,000 deduction under 80CCD(1B).',
        autoAllocate: false, tradeable: false, taxSection: '80CCD1B',
    },
    {
        ticker: 'EPF', label: 'Employee Provident Fund', assetClass: 'retirement',
        open: 1, liquidity: 9999,
        blurb: 'Deducted from salary automatically.',
        rationale: 'Set by your employer. Locked until you leave employment.',
        autoAllocate: false, tradeable: false, taxSection: '80C',
    },
];

const BY_TICKER = new Map(INSTRUMENTS.map((i) => [i.ticker, i]));

export function instrument(ticker: string): Instrument | undefined {
    return BY_TICKER.get(ticker);
}

/** What the manual buy screen offers. */
export const TRADEABLE = INSTRUMENTS.filter((i) => i.tradeable);

/** What an automatic plan is allowed to buy. */
export const AUTO_ALLOCATABLE = INSTRUMENTS.filter((i) => i.autoAllocate);

export const OPENING_PRICES: Record<string, number> = Object.fromEntries(
    INSTRUMENTS.map((i) => [i.ticker, i.open]),
);

export const ASSET_CLASS_OF: Record<string, AssetClass> = Object.fromEntries(
    INSTRUMENTS.map((i) => [i.ticker, i.assetClass]),
);
