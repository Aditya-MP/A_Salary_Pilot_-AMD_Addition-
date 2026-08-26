import type { ScorePillar } from '../engine/runwayEngine';

/* ═══════════════════════════════════════════════════════════════════
   Financial curriculum for Indian salaried employees.

   Two deliberate departures from how every other app does this:

   1. Lessons are NOT ordered by difficulty. They are ordered by what
      the user is currently losing money on. A "beginner → advanced"
      ladder is a course catalogue, not a coaching tool — it puts
      compound-interest basics in front of somebody who is bleeding
      42% on a credit card.

   2. Every lesson names the specific mistake it prevents and roughly
      what that mistake costs. "Understanding Risk Management, 15 min"
      teaches nobody anything. "Why your ELSS is not an emergency fund
      — the mistake that forces people into 42% card debt" does.

   `pillar` links each lesson to a Freedom Score pillar, which is how
   the page personalises the order.
   ═══════════════════════════════════════════════════════════════════ */

export interface Lesson {
    id: string;
    title: string;
    /** The specific error this prevents. Shown under the title. */
    prevents: string;
    minutes: number;
    track: TrackId;
    pillar: ScorePillar['key'];
    level: 'core' | 'deeper' | 'advanced';
    /** The key idea, in one paragraph. This is the actual content. */
    body: string;
    /** One thing to check or do immediately after reading. */
    action: string;
    /** A single check-for-understanding question. */
    quiz: { q: string; options: string[]; answer: number; why: string };
}

export type TrackId = 'safety' | 'debt' | 'tax' | 'invest' | 'protect' | 'behaviour';

export const TRACKS: { id: TrackId; label: string; blurb: string; color: string }[] = [
    { id: 'safety', label: 'Safety first', blurb: 'The buffer that makes everything else possible', color: 'var(--series-1)' },
    { id: 'debt', label: 'Debt', blurb: 'The returns you get by not paying interest', color: 'var(--loss)' },
    { id: 'tax', label: 'Tax', blurb: 'Your biggest lifetime expense', color: 'var(--series-4)' },
    { id: 'invest', label: 'Investing', blurb: 'What actually compounds, and what only looks like it does', color: 'var(--series-2)' },
    { id: 'protect', label: 'Protection', blurb: 'Insurance, and why most people buy the wrong kind', color: 'var(--series-3)' },
    { id: 'behaviour', label: 'Behaviour', blurb: 'The gap between what you know and what you do', color: 'var(--series-5)' },
];

export const LESSONS: Lesson[] = [
    /* ─── Safety ─── */
    {
        id: 'sf-1',
        title: 'Your emergency fund is not an investment',
        prevents: 'Keeping the buffer in ELSS or equity and being forced to sell in a crash',
        minutes: 6,
        track: 'safety',
        pillar: 'runway',
        level: 'core',
        body:
            'An emergency fund has exactly one job: be there, in full, on the worst day of your year. That day is statistically likely to be a day markets are also down — layoffs cluster in downturns. If your buffer is in equity you will sell at the bottom, crystallise the loss, and pay tax on whatever gain survived. A liquid fund returning 6-7% that is redeemable in one working day beats a fund returning 12% that you cannot touch, because you are not buying return here, you are buying the ability to say no to a bad job offer.',
        action:
            'Open your holdings and mark which ones you could turn into cash by Friday. If that total is under three months of essential spending, that is the gap to close before anything else.',
        quiz: {
            q: 'Your ELSS has grown 40% and you need money urgently in month 20 of the lock-in. What can you do?',
            options: ['Redeem with a small penalty', 'Redeem only the gains', 'Nothing — it is fully locked for 3 years', 'Take a loan against it at 8%'],
            answer: 2,
            why: 'ELSS has a hard 3-year lock-in per instalment. No penalty, no partial exit, no early redemption. Each SIP instalment locks separately, which surprises most people.',
        },
    },
    {
        id: 'sf-2',
        title: 'How many months you actually need',
        prevents: 'Copying the generic "3 to 6 months" rule when your situation is different',
        minutes: 5,
        track: 'safety',
        pillar: 'runway',
        level: 'core',
        body:
            'The standard advice assumes a dual-income household with no dependents and a liquid job market. Adjust it: add a month for each dependent, add two if you are the only earner, add two more if your skills take longer than a quarter to place, and subtract if your partner earns independently. Measure against essential spending — rent, food, EMIs, utilities, family support — not against your total spend, because discretionary spending stops on day one of a crisis.',
        action:
            'Add up only the expenses you would still pay with zero income. That monthly number, times your personal target, is your real emergency fund goal.',
        quiz: {
            q: 'You spend ₹85,000 a month, of which ₹28,000 is eating out, shopping and travel. What is the base for your runway calculation?',
            options: ['₹85,000', '₹57,000', '₹28,000', 'Your gross salary'],
            answer: 1,
            why: '₹57,000 — the essentials. Discretionary spending is the first thing that stops, so including it makes your buffer look worse than it is and can push you into over-saving.',
        },
    },

    /* ─── Debt ─── */
    {
        id: 'db-1',
        title: 'Clearing a 42% card is a 42% return',
        prevents: 'Running a SIP while revolving credit card debt',
        minutes: 7,
        track: 'debt',
        pillar: 'debt',
        level: 'core',
        body:
            'A credit card revolving at 42% annualised is the highest-conviction investment most people will ever be offered, and it is offered in reverse. Paying off ₹84,000 of card debt returns exactly 42%, guaranteed, tax-free, with zero volatility. No equity fund can promise that. Yet the psychology runs the other way: paying debt feels like losing money and investing feels like building wealth, so people run a ₹12,000 SIP while paying ₹2,940 a month in card interest. The SIP has to earn 42% before tax just to break even against the card.',
        action:
            'List every debt with its rate. Anything above roughly 10% should be cleared before a single additional rupee goes into investments.',
        quiz: {
            q: 'You have ₹1L spare, a card at 42% and an equity fund averaging 12%. What maximises wealth?',
            options: ['Split it 50/50', 'All into the fund — equities beat debt long term', 'All to the card', 'Keep it in savings and decide later'],
            answer: 2,
            why: 'The card. A guaranteed 42% saved beats an uncertain 12% earned, and the 12% is taxed while the 42% saved is not.',
        },
    },
    {
        id: 'db-2',
        title: 'Which loan to kill first',
        prevents: 'Clearing the biggest balance instead of the most expensive one',
        minutes: 5,
        track: 'debt',
        pillar: 'debt',
        level: 'deeper',
        body:
            'Rank by interest rate, never by balance. A ₹2.1L personal loan at 14.5% costs ₹30,450 a year; a ₹1.4L education loan at 9.5% costs ₹13,300 — and the education loan interest is fully deductible under 80E with no upper cap, dropping its effective cost closer to 6.5%. The "snowball" method of clearing small balances first is a behavioural crutch: it works if you genuinely need early wins to stay motivated, and it costs you real money if you do not.',
        action:
            'Check whether any of your loans carry a prepayment penalty. Floating-rate loans to individuals generally cannot, by RBI rule.',
        quiz: {
            q: 'Which of these is genuinely cheapest after tax, at a 31.2% slab?',
            options: ['Education loan at 9.5%, 80E deductible', 'Car loan at 9%', 'Personal loan at 14.5%', 'Home loan at 8.5%, principal already covered by 80C'],
            answer: 0,
            why: 'The 80E deduction has no cap, so 9.5% costs about 6.5% after tax. The 8.5% home loan is close, but its 80C benefit is already consumed by your EPF.',
        },
    },

    /* ─── Tax ─── */
    {
        id: 'tx-1',
        title: 'The ₹50,000 nobody claims',
        prevents: 'Missing 80CCD(1B), the most-skipped deduction in India',
        minutes: 6,
        track: 'tax',
        pillar: 'savings',
        level: 'core',
        body:
            'Section 80CCD(1B) allows ₹50,000 for NPS contributions and it sits entirely on top of the ₹1.5 lakh 80C limit. At a 31.2% slab that is ₹15,600 of tax you simply do not pay. Most people never claim it because 80C is already full from EPF and they assume the tax-saving conversation is over. The catch worth knowing before you commit: NPS is locked until 60, and at exit 60% is tax-free while the remaining 40% must buy an annuity that is taxed as income.',
        action: 'Check your Form 16 Part B for a non-zero 80CCD(1B) line. If it is zero, you have unused headroom.',
        quiz: {
            q: 'Your EPF alone already fills the ₹1.5L under 80C. How much more can NPS still save you?',
            options: ['Nothing — 80C is full', '₹50,000 of deduction under 80CCD(1B)', '₹1,50,000 more', 'Only if you switch to the new regime'],
            answer: 1,
            why: '80CCD(1B) is a separate ₹50,000 ceiling, independent of 80C. It is also unavailable under the new regime, which is part of the regime calculation.',
        },
    },
    {
        id: 'tx-2',
        title: 'Old regime or new — running the actual numbers',
        prevents: 'Letting HR pick, or picking once and never revisiting',
        minutes: 9,
        track: 'tax',
        pillar: 'savings',
        level: 'deeper',
        body:
            'There is no universally better regime; there is a break-even level of deductions. The new regime gives lower slabs and a ₹75,000 standard deduction but disallows HRA, 80C, 80D and 80CCD(1B). The old regime keeps all of them with higher slabs. Roughly: if your claimable deductions including HRA exceed about ₹3.75-4.25 lakh, the old regime wins; below that, the new one does. The decision changes when your rent changes, when a home loan starts, and when a child is born — so it deserves revisiting every year, not once.',
        action:
            'Open the Tax Centre and read the break-even figure. If you are within ₹50,000 of it, filling your remaining headroom may flip which regime is better.',
        quiz: {
            q: 'Under the new regime, which of these can you still claim?',
            options: ['HRA exemption', '80C investments', 'Standard deduction of ₹75,000', '80D health premium'],
            answer: 2,
            why: 'Only the standard deduction (and employer NPS under 80CCD(2)) survives. HRA, 80C and 80D are all unavailable.',
        },
    },
    {
        id: 'tx-3',
        title: 'Harvesting losses before 31 March',
        prevents: 'Paying tax on gains you could legally have cancelled',
        minutes: 8,
        track: 'tax',
        pillar: 'growth',
        level: 'advanced',
        body:
            'If one holding is up ₹80,000 and another is down ₹30,000, selling the loser cancels ₹30,000 of taxable gain. India has no wash-sale rule, so you can buy the same fund back the next trading day — your position is unchanged and only the tax bill moves. Two limits matter: crypto losses cannot be set off against anything at all, and the opportunity expires on 31 March rather than carrying into the next year. Also use the ₹1.25 lakh annual LTCG exemption deliberately — harvesting gains up to that limit each year resets your cost base for free.',
        action: 'Check the Tax view in Portfolio before March. It flags every position sitting on a usable loss.',
        quiz: {
            q: 'You are up ₹1L on an equity fund and down ₹40,000 on Ethereum. What can you offset?',
            options: ['The full ₹40,000', 'Half of it', 'Nothing — crypto losses cannot be set off', '₹25,000, the annual cap'],
            answer: 2,
            why: 'Virtual digital asset losses cannot be set off against any income, including other crypto gains. This is unique to VDAs and catches people out constantly.',
        },
    },

    /* ─── Investing ─── */
    {
        id: 'in-1',
        title: 'Why your SIP does not improve your runway',
        prevents: 'Believing that investing more makes you safer',
        minutes: 6,
        track: 'invest',
        pillar: 'runway',
        level: 'core',
        body:
            'Increasing a SIP by ₹5,000 builds wealth and adds nothing to your runway — it converts spendable money into locked money. This is the most common confusion in personal finance and the reason people with healthy portfolios still panic in a layoff. Safety and growth are different jobs needing different instruments. Until your buffer covers your target, an extra rupee is worth more in a liquid fund at 6.8% than in an equity fund at 12%, because the liquid rupee is the one that will still be there on the day you need it.',
        action: 'Route surplus to the buffer until the runway target is met, then switch the same amount to growth. In that order.',
        quiz: {
            q: 'Your runway is 2 months and you have ₹10,000 a month spare. Where should it go first?',
            options: ['Equity SIP — time in market matters', 'Liquid fund until runway hits target', 'Split evenly', 'Crypto, for the higher return'],
            answer: 1,
            why: 'A two-month runway is fragile. Time in market matters enormously, but not if a job loss forces you to sell that market position at the worst moment.',
        },
    },
    {
        id: 'in-2',
        title: 'Expense ratio is the only guaranteed number',
        prevents: 'Choosing funds on past returns instead of cost',
        minutes: 7,
        track: 'invest',
        pillar: 'growth',
        level: 'deeper',
        body:
            'Past returns predict future returns weakly. Costs predict future returns strongly, because a fee is certain and a return is not. A 1.8% regular-plan expense ratio versus a 0.2% direct-plan index fund is 1.6% a year, compounded: on ₹25,000 a month over 25 years that difference is worth roughly ₹70 lakh. The word "regular" on your fund statement means a distributor is being paid a trail commission out of your returns forever. Switching to "direct" is the same fund, same manager, same portfolio, minus the commission.',
        action: 'Open your fund statement and look for "Regular" next to any scheme name. Each one is costing about 1% a year, permanently.',
        quiz: {
            q: 'Two identical index funds, one at 0.2% and one at 1.5%. Over 25 years on the same SIP, roughly how much does the difference cost?',
            options: ['About 5% of the final corpus', 'About 10%', 'Around 25-30% of the final corpus', 'Negligible'],
            answer: 2,
            why: 'Compounded over decades a 1.3% annual drag typically removes a quarter to a third of the final corpus. Costs compound exactly like returns do.',
        },
    },
    {
        id: 'in-3',
        title: 'Rebalancing is where the discipline lives',
        prevents: 'Letting a winning position quietly become your whole portfolio',
        minutes: 6,
        track: 'invest',
        pillar: 'growth',
        level: 'advanced',
        body:
            'You chose 45% equity for a reason. After a good year it is 58%, and your portfolio is now riskier than the one you agreed to — not by decision but by drift. Rebalancing forces you to trim what has run and add to what has lagged, which is the only systematic way most people ever manage to sell high and buy low. Rebalance on a band, not a calendar: act when a class drifts more than 5 percentage points from target, and prefer redirecting new contributions over selling, since selling triggers tax.',
        action: 'Check the Allocation view. Anything more than 5 points off target is a candidate — fix it with new money first.',
        quiz: {
            q: 'Equity has drifted from 45% to 58%. What is the tax-cheapest fix?',
            options: ['Sell equity down to 45%', 'Direct new contributions into the underweight classes until it corrects', 'Do nothing, winners keep winning', 'Sell everything and start over'],
            answer: 1,
            why: 'Redirecting new money rebalances without realising gains, so no capital gains tax. Selling works too, but you pay for it.',
        },
    },

    /* ─── Protection ─── */
    {
        id: 'pr-1',
        title: 'Never buy insurance that invests',
        prevents: 'ULIPs and endowment plans sold as tax-saving investments',
        minutes: 8,
        track: 'protect',
        pillar: 'protection',
        level: 'core',
        body:
            'A product that mixes insurance and investment does both badly, and the mixing is what hides the cost. An endowment or ULIP typically returns 4-6% while a term plan plus an index fund costs a fraction and covers you for ten times as much. The reason they are sold so aggressively is commission: term insurance pays the agent a few hundred rupees, an endowment plan pays tens of thousands in the first year alone. Buy pure term cover for protection, buy index funds for growth, and never let one product claim to do both.',
        action:
            'For any policy you hold, work out cover ÷ annual premium. Term insurance gives roughly 500-1000x. Anything under 50x is an investment product wearing an insurance label.',
        quiz: {
            q: '₹50,000 a year buys either ₹5L of endowment cover or ₹1.5Cr of term cover. Which is the insurance product?',
            options: ['The endowment — it also returns money', 'The term plan', 'Both are equivalent', 'Depends on your age'],
            answer: 1,
            why: 'Insurance is measured by cover per rupee of premium. 30x is a savings product; 300x is insurance.',
        },
    },
    {
        id: 'pr-2',
        title: 'Corporate health cover disappears with the job',
        prevents: 'Relying only on employer insurance',
        minutes: 5,
        track: 'protect',
        pillar: 'protection',
        level: 'core',
        body:
            'Employer health cover ends the day your employment does — precisely when you can least afford a hospital bill and are least insurable. It also usually excludes your parents, carries sub-limits on room rent that quietly cap large claims, and cannot be ported. Hold a personal base policy alongside it, bought while you are young and healthy so the four-year pre-existing-disease waiting period is already served before you need it. A super top-up above a ₹5L deductible is unusually cheap and is the efficient way to buy a high total cover.',
        action: 'Check whether your policy has a room-rent sub-limit. If it does, a proportionate-deduction clause can cut a large claim by 30-40%.',
        quiz: {
            q: 'When is the worst time to first buy personal health insurance?',
            options: ['In your twenties', 'After a diagnosis or job loss', 'When you get married', 'When your parents turn 60'],
            answer: 1,
            why: 'Pre-existing conditions face a waiting period of up to four years, and insurers can decline outright. Cover has to exist before you need it.',
        },
    },

    /* ─── Behaviour ─── */
    {
        id: 'bh-1',
        title: 'Why you check the portfolio when markets fall',
        prevents: 'Selling at the bottom, which is where most lifetime returns are lost',
        minutes: 7,
        track: 'behaviour',
        pillar: 'growth',
        level: 'core',
        body:
            'Losses register roughly twice as strongly as equivalent gains — loss aversion, and it is not a flaw you can reason your way out of. It is why the average investor underperforms the average fund they own: the fund goes up over a decade, the investor buys after rallies and sells after falls. The countermeasures are structural, not motivational. Automate contributions so the decision is made once. Add friction before selling. And check the portfolio quarterly, not daily — the more often you look, the more losses you see, and the more likely you are to act on one.',
        action:
            'Turn off price notifications and set a quarterly reminder instead. This single change beats most investment decisions you will make.',
        quiz: {
            q: 'Why does the average investor underperform the average fund?',
            options: ['Fees', 'Bad fund selection', 'Buying after rallies and selling after falls', 'Taxes'],
            answer: 2,
            why: 'The behaviour gap. The fund earns its return over the full period; the investor only holds it for part of it, and usually the wrong part.',
        },
    },
    {
        id: 'bh-2',
        title: 'Lifestyle creep eats every raise',
        prevents: 'Ending a decade of raises with the same savings rate',
        minutes: 6,
        track: 'behaviour',
        pillar: 'savings',
        level: 'deeper',
        body:
            'A 9% raise typically becomes 9% more spending within two months, because spending expands to fill available income and the new level never feels like a choice. The fix is mechanical: on the day a raise lands, increase your automatic investment by half of it before the money reaches your spending account. You still feel better off — you got half — and your savings rate rises instead of holding flat. Done consistently through a career, this one habit moves financial independence forward by years.',
        action: 'Set a calendar reminder for your appraisal month: "split the raise 50/50 before the first payslip arrives."',
        quiz: {
            q: 'You get a ₹15,000 monthly raise. What protects your savings rate best?',
            options: ['Invest all ₹15,000', 'Invest ₹7,500 immediately, spend the rest', 'Spend it for a year, then invest', 'Wait for the next raise'],
            answer: 1,
            why: 'All-or-nothing rarely survives contact with real life. Half is sustainable, feels like a genuine reward, and still lifts your savings rate every single year.',
        },
    },
];

/* ─── Personalisation: order lessons by the user's weakest pillar ─── */

export function prioritiseLessons(
    lessons: Lesson[],
    pillars: ScorePillar[],
    completed: string[]
): Lesson[] {
    // Rank pillars worst-first, so the weakest area surfaces first.
    const rank = new Map(
        [...pillars]
            .sort((a, b) => a.score / a.max - b.score / b.max)
            .map((p, i) => [p.key, i])
    );

    return [...lessons].sort((a, b) => {
        const doneA = completed.includes(a.id) ? 1 : 0;
        const doneB = completed.includes(b.id) ? 1 : 0;
        if (doneA !== doneB) return doneA - doneB; // unfinished first

        const pa = rank.get(a.pillar) ?? 99;
        const pb = rank.get(b.pillar) ?? 99;
        if (pa !== pb) return pa - pb;

        const order = { core: 0, deeper: 1, advanced: 2 };
        return order[a.level] - order[b.level];
    });
}
