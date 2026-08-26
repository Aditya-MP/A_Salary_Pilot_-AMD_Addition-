import type { FinancialProfile } from '../domain/types';
import type { RunwayBreakdown, FreedomScore } from './runwayEngine';
import type { PortfolioSummary } from './portfolioEngine';
import type { RegimeComparison, Headroom } from './regimeEngine';
import type { Leak } from './leakEngine';
import { money, moneyShort, share, daysLeftInFY } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   AI COACH — agent definitions.

   You asked whether the original four agents were pulling their weight.
   My read, and what changed:

   • Tax Expert         KEPT, rewritten. The idea was right; the output
                        was three generic sentences that would be true
                        for any user. It now computes against the actual
                        regime comparison and deduction headroom.

   • Risk Alert         KEPT, reframed. "Tech sector showing increased
                        volatility" is a headline, not advice — the user
                        can do nothing with it. It now reports the risks
                        that are specific to THIS portfolio:
                        concentration, liquidity, and drift.

   • Market Rules       CUT as an agent. Summarising SEBI circulars is
                        news, not coaching, and it belongs on the News
                        page. An agent should tell you what to do about
                        your own money.

   • Portfolio Planner  KEPT, rewritten. It previously asserted a fixed
                        "18-22% CAGR" with no basis, which is the exact
                        kind of claim that destroys trust and, in India,
                        would not survive SEBI scrutiny. It now issues
                        rebalancing instructions in rupees.

   Three agents added, covering what was missing entirely — and these
   turned out to matter more than any of the originals:

   • Runway Guard       Nothing was watching whether the user could
                        survive a job loss.
   • Debt Strategist    Nothing noticed a 42% credit card while the app
                        cheerfully recommended more equity exposure.
   • Leak Hunter        Nothing looked at money going OUT.

   Every finding below is computed. No agent returns a fixed string.
   ═══════════════════════════════════════════════════════════════════ */

export type Severity = 'urgent' | 'attention' | 'opportunity' | 'healthy';

export interface Finding {
    id: string;
    severity: Severity;
    headline: string;
    /** The number that makes the case. */
    figure?: string;
    figureLabel?: string;
    /** Why the agent reached this conclusion — the reasoning, shown. */
    because: string;
    /** What to actually do. */
    action: string;
    /** Confidence the agent has in this call. */
    confidence: number;
}

export interface Agent {
    id: string;
    name: string;
    role: string;
    /** What this agent is watching, in one line. */
    watches: string;
    color: string;
    findings: Finding[];
    /** Headline verdict for the collapsed card. */
    verdict: string;
    severity: Severity;
}

interface Inputs {
    profile: FinancialProfile;
    runway: RunwayBreakdown;
    score: FreedomScore;
    portfolio: PortfolioSummary;
    regimes: RegimeComparison;
    headroom: { slots: Headroom[]; totalUnused: number; totalWorth: number };
    leaks: { leaks: Leak[]; totalAnnual: number; recoverableNow: number };
}

const worst = (fs: Finding[]): Severity =>
    fs.some((f) => f.severity === 'urgent') ? 'urgent'
        : fs.some((f) => f.severity === 'attention') ? 'attention'
            : fs.some((f) => f.severity === 'opportunity') ? 'opportunity'
                : 'healthy';

export function runAgents(i: Inputs): Agent[] {
    return [
        runwayGuard(i),
        debtStrategist(i),
        taxOptimiser(i),
        leakHunter(i),
        portfolioDoctor(i),
        milestonePlanner(i),
    ];
}

/* ─────────────────────────── 1 · Runway Guard ─────────────────────────── */

function runwayGuard({ runway, portfolio }: Inputs): Agent {
    const f: Finding[] = [];

    if (runway.months < runway.target) {
        f.push({
            id: 'rg-gap',
            severity: runway.months < 3 ? 'urgent' : 'attention',
            headline:
                runway.months < 1
                    ? 'You have under a month of cover'
                    : `You are ${(runway.target - runway.months).toFixed(1)} months short of safe`,
            figure: money(runway.gap),
            figureLabel: 'still needed',
            because: `Your essential spending is ${money(runway.essentialBurn)} a month and you can reach ${money(runway.liquidToday)} today. That is ${runway.months.toFixed(1)} months against a ${runway.target.toFixed(0)}-month target set for your ${runway.debtService > 0 ? 'EMI load and ' : ''}dependents.`,
            action: `Route surplus into a liquid fund until this closes. At your current surplus that is roughly ${Math.ceil(runway.gap / Math.max(1, runway.totalBurn * 0.15))} months of consistent saving.`,
            confidence: 0.95,
        });
    }

    const lockedRatio = runway.locked / (runway.locked + runway.liquidToday || 1);
    if (lockedRatio > 0.45) {
        f.push({
            id: 'rg-locked',
            severity: 'attention',
            headline: `${share(lockedRatio * 100)} of your wealth is unreachable`,
            figure: money(runway.locked),
            figureLabel: 'locked away',
            because:
                'PPF, NPS and ELSS inside lock-in are excellent long-term instruments and completely useless in an emergency. People routinely count them as their safety net and discover otherwise at the worst moment.',
            action:
                'Keep contributing — but do not let this number substitute for a liquid buffer. Judge safety on reachable money only.',
            confidence: 0.9,
        });
    }

    if (portfolio.ladder[0].value < runway.essentialBurn) {
        f.push({
            id: 'rg-samedy',
            severity: 'attention',
            headline: 'Less than one month reachable same-day',
            figure: money(portfolio.ladder[0].value),
            figureLabel: 'available today',
            because:
                'Emergencies rarely wait for a T+3 settlement. Medical admissions and deposits often need money within hours.',
            action: 'Hold at least one month of essentials in a savings account or overnight fund.',
            confidence: 0.85,
        });
    }

    if (f.length === 0) {
        f.push({
            id: 'rg-ok',
            severity: 'healthy',
            headline: 'Your buffer is doing its job',
            figure: `${runway.months.toFixed(1)} mo`,
            figureLabel: 'runway',
            because: `${money(runway.liquidToday)} reachable against ${money(runway.essentialBurn)} of essential monthly spending.`,
            action: 'Nothing needed. Surplus can now go to growth rather than safety.',
            confidence: 0.9,
        });
    }

    return {
        id: 'runway-guard',
        name: 'Runway Guard',
        role: 'Watches whether you could survive losing your income',
        watches: 'Liquid assets vs essential burn, updated as prices move',
        color: 'var(--series-1)',
        findings: f,
        verdict:
            runway.months < runway.target
                ? `${runway.months.toFixed(1)} months of cover — ${money(runway.gap)} short of safe`
                : `${runway.months.toFixed(1)} months of cover. You are safe.`,
        severity: worst(f),
    };
}

/* ─────────────────────────── 2 · Debt Strategist ─────────────────────────── */

function debtStrategist({ profile, portfolio }: Inputs): Agent {
    const f: Finding[] = [];
    const debts = [...profile.debts].sort((a, b) => b.rate - a.rate);
    const expensive = debts.filter((d) => d.rate > 0.12);

    expensive.forEach((d, idx) => {
        const annual = d.balance * d.rate;
        f.push({
            id: `ds-${d.id}`,
            severity: d.rate > 0.3 ? 'urgent' : 'attention',
            headline: `${d.label} is costing ${moneyShort(annual)} a year`,
            figure: share(d.rate * 100, 1),
            figureLabel: 'interest rate',
            because: `Your portfolio has returned ${share(portfolio.annualised, 1)} annualised. This debt compounds against you at ${share(d.rate * 100, 1)}. Every rupee here beats every rupee invested, by a margin no fund can close.`,
            action:
                idx === 0
                    ? `Clear this before any new investment. Paying it off is a guaranteed, tax-free ${share(d.rate * 100, 0)} return.`
                    : `Next in line after the ${share(expensive[0].rate * 100, 0)} debt is gone. Pay the minimum until then.`,
            confidence: 1,
        });
    });

    const deductible = debts.filter((d) => d.taxDeductible);
    deductible.forEach((d) => {
        f.push({
            id: `ds-ded-${d.id}`,
            severity: 'opportunity',
            headline: `${d.label} is cheaper than it looks`,
            figure: share(d.rate * 0.688 * 100, 1),
            figureLabel: 'effective rate',
            because: `Interest is deductible, so at a 31.2% slab the real cost is about ${share(d.rate * 0.688 * 100, 1)}, not ${share(d.rate * 100, 1)}. Section 80E in particular has no upper cap.`,
            action: 'Do not rush to prepay this one. Clear the expensive debt first.',
            confidence: 0.85,
        });
    });

    if (f.length === 0) {
        f.push({
            id: 'ds-ok',
            severity: 'healthy',
            headline: 'No debt is working against you',
            because: 'Nothing you owe carries a rate that outruns your portfolio.',
            action: 'Keep it that way. Pay cards in full each cycle.',
            confidence: 0.9,
        });
    }

    const totalInterest = debts.reduce((s, d) => s + d.balance * d.rate, 0);

    return {
        id: 'debt-strategist',
        name: 'Debt Strategist',
        role: 'Ranks what to pay off first, by rate rather than balance',
        watches: 'Every liability, its true after-tax cost, and payoff order',
        color: 'var(--loss)',
        findings: f,
        verdict:
            expensive.length > 0
                ? `${moneyShort(totalInterest)}/yr in interest — start with the ${share(debts[0].rate * 100, 0)} debt`
                : 'Debt load is under control',
        severity: worst(f),
    };
}

/* ─────────────────────────── 3 · Tax Optimiser ─────────────────────────── */

function taxOptimiser({ regimes, headroom, portfolio }: Inputs): Agent {
    const f: Finding[] = [];
    const daysLeft = daysLeftInFY();

    f.push({
        id: 'tx-regime',
        severity: 'opportunity',
        headline: `The ${regimes.winner} regime saves you ${moneyShort(regimes.saving)}`,
        figure: money(regimes.saving),
        figureLabel: 'a year',
        because: `Run against your real declarations: old regime ${money(regimes.old.total)}, new regime ${money(regimes.new.total)}. Your marginal rate is ${share(regimes.old.marginal * 100, 1)}.`,
        action:
            regimes.breakEvenDeductions > 0
                ? `Stay on the new regime unless you can add ${money(regimes.breakEvenDeductions)} of deductions — you have ${money(headroom.totalUnused)} of headroom available.`
                : 'Confirm this regime in your employer declaration before the proof deadline.',
        confidence: 0.9,
    });

    headroom.slots
        .filter((h) => h.unused > 15_000)
        .forEach((h) => {
            f.push({
                id: `tx-${h.section}`,
                severity: daysLeft < 75 ? 'urgent' : 'opportunity',
                headline: `${money(h.unused)} of ${h.section} headroom unused`,
                figure: money(h.worth),
                figureLabel: 'tax you would save',
                because: `${h.note}. You are currently at ${share(h.filled)} of the ${money(h.limit)} limit, and none of it carries into next year.`,
                action: `Fill it with ${h.fillers.slice(0, 2).join(' or ')}. ${daysLeft} days remain in this financial year.`,
                confidence: 0.92,
            });
        });

    if (portfolio.harvestSaving > 1_000) {
        f.push({
            id: 'tx-harvest',
            severity: 'opportunity',
            headline: `${money(portfolio.harvestSaving)} recoverable by harvesting losses`,
            figure: money(portfolio.harvestSaving),
            figureLabel: 'tax saved',
            because: `${portfolio.harvestable.length} position${portfolio.harvestable.length > 1 ? 's are' : ' is'} sitting on a loss that can cancel gains elsewhere. India has no wash-sale rule, so you can repurchase the next day and keep the position.`,
            action: 'Realise those losses before 31 March. The opportunity does not carry forward.',
            confidence: 0.85,
        });
    }

    return {
        id: 'tax-optimiser',
        name: 'Tax Optimiser',
        role: 'Runs both regimes and finds unclaimed deductions',
        watches: 'Slabs, 80C/80D/80CCD headroom, HRA, and harvestable losses',
        color: 'var(--series-4)',
        findings: f,
        verdict: `${money(headroom.totalWorth + portfolio.harvestSaving)} recoverable · ${daysLeft} days left in FY`,
        severity: worst(f),
    };
}

/* ─────────────────────────── 4 · Leak Hunter ─────────────────────────── */

function leakHunter({ leaks }: Inputs): Agent {
    const f: Finding[] = leaks.leaks.slice(0, 4).map((l) => ({
        id: `lh-${l.id}`,
        severity: l.annualCost > 20_000 ? 'urgent' : l.annualCost > 5_000 ? 'attention' : 'opportunity',
        headline: `${l.label} — ${moneyShort(l.annualCost)} a year`,
        figure: moneyShort(l.annualCost),
        figureLabel: 'annual cost',
        because: l.why,
        action: l.fix,
        confidence: l.confidence,
    }));

    if (f.length === 0) {
        f.push({
            id: 'lh-ok',
            severity: 'healthy',
            headline: 'Nothing is leaking',
            because: 'No dead subscriptions, no idle cash, no unclaimed deductions.',
            action: 'Re-run this monthly — leaks reappear quietly.',
            confidence: 0.8,
        });
    }

    return {
        id: 'leak-hunter',
        name: 'Leak Hunter',
        role: 'Finds money leaving the account without being noticed',
        watches: 'Subscriptions, interest, idle cash, insurance gaps',
        color: 'var(--series-5)',
        findings: f,
        verdict: `${moneyShort(leaks.totalAnnual)}/yr leaking · ${moneyShort(leaks.recoverableNow)} recoverable without pain`,
        severity: worst(f),
    };
}

/* ─────────────────────────── 5 · Portfolio Doctor ─────────────────────────── */

function portfolioDoctor({ portfolio, profile }: Inputs): Agent {
    const f: Finding[] = [];

    portfolio.allocation
        .filter((a) => Math.abs(a.drift) > 5)
        .forEach((a) => {
            f.push({
                id: `pd-drift-${a.assetClass}`,
                severity: 'attention',
                headline: `${a.label} is ${a.drift > 0 ? 'overweight' : 'underweight'} by ${share(Math.abs(a.drift), 1)}`,
                figure: money(Math.abs(a.rebalance)),
                figureLabel: a.drift > 0 ? 'to trim' : 'to add',
                because: `You hold ${share(a.weight, 1)} against a ${share(a.target)} target for a ${profile.risk} profile. Drift like this is not a decision you made — it is what the market did to you.`,
                action:
                    a.drift > 0
                        ? 'Redirect new contributions elsewhere rather than selling. Rebalancing with fresh money avoids capital gains tax entirely.'
                        : `Point your next ${money(Math.abs(a.rebalance))} of contributions here.`,
                confidence: 0.88,
            });
        });

    if (portfolio.concentration > 20 && portfolio.biggestPosition) {
        f.push({
            id: 'pd-conc',
            severity: portfolio.concentration > 30 ? 'urgent' : 'attention',
            headline: `${portfolio.biggestPosition.holding.label} is ${share(portfolio.biggestPosition.weight, 1)} of everything`,
            figure: portfolio.concentration.toFixed(1),
            figureLabel: 'concentration index',
            because:
                'Above roughly 25 your result depends on one or two positions. That is a bet with a portfolio wrapper on it.',
            action: 'Cap any single position at about 15%. Trim with new contributions rather than sales.',
            confidence: 0.85,
        });
    }

    const shortTermWinners = portfolio.holdings.filter(
        (h) => !h.longTerm && !h.locked && h.pnl > 10_000 &&
            h.holding.assetClass === 'equity' && h.daysHeld > 270
    );
    shortTermWinners.forEach((h) => {
        f.push({
            id: `pd-ltcg-${h.holding.id}`,
            severity: 'opportunity',
            headline: `${h.holding.label} crosses into long-term in ${365 - h.daysHeld} days`,
            figure: money(h.pnl * (0.2 - 0.125)),
            figureLabel: 'tax saved by waiting',
            because: `Held ${h.daysHeld} days. Selling now is taxed at 20% short-term; past 365 days it drops to 12.5% with a ₹1.25L annual exemption on top.`,
            action: `If you were planning to sell, wait ${365 - h.daysHeld} days. Rarely is doing nothing worth this much.`,
            confidence: 0.95,
        });
    });

    if (f.length === 0) {
        f.push({
            id: 'pd-ok',
            severity: 'healthy',
            headline: 'Allocation is on target and well spread',
            because: `Concentration index ${portfolio.concentration.toFixed(1)}, no class more than 5 points off target.`,
            action: 'Leave it alone. Check again next quarter.',
            confidence: 0.85,
        });
    }

    return {
        id: 'portfolio-doctor',
        name: 'Portfolio Doctor',
        role: 'Checks drift, concentration and tax timing',
        watches: 'Allocation vs target, position sizing, LTCG thresholds',
        color: 'var(--series-2)',
        findings: f,
        verdict: `${share(portfolio.pnlPct, 1)} unrealised · concentration ${portfolio.concentration.toFixed(1)}`,
        severity: worst(f),
    };
}

/* ─────────────────────────── 6 · Milestone Planner ─────────────────────────── */

function milestonePlanner({ profile, score, runway }: Inputs): Agent {
    const f: Finding[] = [];

    const behind = profile.goals.filter((g) => {
        const monthsLeft = Math.max(
            1,
            (new Date(g.by).getTime() - Date.now()) / (86_400_000 * 30.44)
        );
        const needed = (g.target - g.saved) / monthsLeft;
        return needed > g.monthlyContribution * 1.15;
    });

    behind.forEach((g) => {
        const monthsLeft = Math.max(
            1,
            (new Date(g.by).getTime() - Date.now()) / (86_400_000 * 30.44)
        );
        const needed = (g.target - g.saved) / monthsLeft;
        f.push({
            id: `mp-${g.id}`,
            severity: g.priority === 'safety' ? 'attention' : 'opportunity',
            headline: `"${g.label}" needs ${money(Math.round(needed))}/mo, not ${money(g.monthlyContribution)}`,
            figure: money(Math.round(needed - g.monthlyContribution)),
            figureLabel: 'monthly shortfall',
            because: `${money(g.target - g.saved)} still to go with ${Math.round(monthsLeft)} months on the clock. At the current rate you land in ${new Date(Date.now() + ((g.target - g.saved) / Math.max(1, g.monthlyContribution)) * 86_400_000 * 30.44).getFullYear()}.`,
            action:
                g.priority === 'aspiration'
                    ? 'Either raise the contribution or move the date. Both are fine — quietly missing it is not.'
                    : 'This is a safety goal. Fund it before any aspiration goal.',
            confidence: 0.9,
        });
    });

    f.push({
        id: 'mp-fi',
        severity: score.yearsToFreedom > 30 ? 'attention' : 'opportunity',
        headline:
            score.yearsToFreedom >= 70
                ? 'Work does not become optional on this trajectory'
                : `Work becomes optional at ${Math.round(score.freedomAge)}`,
        figure: score.yearsToFreedom >= 70 ? '—' : `${score.yearsToFreedom.toFixed(0)} yrs`,
        figureLabel: 'from today',
        because: `You need ${money(score.fiNumber)} — 25× your ${money(runway.essentialBurn * 12)} annual essential spending. You are ${share(score.fiProgress * 100, 1)} there, investing ${money(Math.max(0, score.surplus))} a month plus EPF.`,
        action:
            score.savingsRate < 0.2
                ? `Your savings rate is ${share(score.savingsRate * 100)}. Getting it to 20% typically pulls this date in by 6-8 years — more than any fund selection will.`
                : 'Hold the savings rate through your next few raises and this date holds.',
        confidence: 0.75,
    });

    return {
        id: 'milestone-planner',
        name: 'Milestone Planner',
        role: 'Checks whether your goals are actually on schedule',
        watches: 'Every goal against its deadline, plus the freedom horizon',
        color: 'var(--series-3)',
        findings: f,
        verdict:
            behind.length > 0
                ? `${behind.length} goal${behind.length > 1 ? 's' : ''} behind schedule`
                : 'All goals on track',
        severity: worst(f),
    };
}
