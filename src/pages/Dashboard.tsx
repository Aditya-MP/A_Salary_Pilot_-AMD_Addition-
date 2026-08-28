import { Link } from 'react-router-dom';
import {
    ArrowRight, Zap, Wallet, Check, Droplets, Shield, Compass, TrendingDown,
} from 'lucide-react';
import { useFinancials } from '../hooks/useFinancials';
import { useSimulation } from '../hooks/useSimulation';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { Stat } from '../components/primitives/Stat';
import { StackedMeter } from '../components/primitives/Meter';
import { RunwayHero } from '../components/dashboard/RunwayHero';
import { PortfolioHero } from '../components/dashboard/PortfolioHero';
import { FreedomScore } from '../components/dashboard/FreedomScore';
import { money, moneyShort, pct, share, relativeDays, months as fmtMonths } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   Overview.

   Rebuilt to the same rhythm as the pages that were working — header,
   a row of stat tiles, then cards — rather than opening with a bespoke
   split hero that matched nothing else in the app.

   Structural rules applied throughout, because they are what stops a
   dashboard bleeding outside its own background:
   • Every grid column is minmax(0,…) or carries min-w-0. A chart in a
     `1fr` column will not shrink and pushes the card past the page.
   • Every long value truncates rather than expanding its container.
   • Charts live in a fixed-height, min-w-0 box. Nothing sizes itself
     from content.
   ═══════════════════════════════════════════════════════════════════ */

export default function Dashboard() {
    const { ready, runway, score, levers, projection, leaks, payday, portfolio, profile } = useFinancials();

    // Progressive enhancement: the local point estimate renders instantly;
    // the simulated distribution appears underneath if the backend answers.
    const sim = useSimulation(profile, runway, score, 0.075);
    const applyLever = useAppStore((s) => s.applyLever);
    const applied = useAppStore((s) => s.appliedLevers);

    const runwayTone =
        runway.status === 'critical' ? 'loss'
            : runway.status === 'thin' ? 'warn'
                : runway.status === 'building' ? 'info'
                    : 'gain';

    const today = new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });

    // A profile missing income or essential spending cannot produce a true
    // runway. The engine's guard returns 0, which renders as "0.0 months ·
    // critical" — a confident statement that this person is broke, made
    // about somebody the app knows nothing about. Onboarding should make
    // this unreachable; it is here because a screen that can state a
    // falsehood eventually will.
    if (!ready) {
        return (
            <>
                <PageHeader
                    eyebrow={today}
                    title="Overview"
                    description="Nothing here yet, because nothing has been assumed on your behalf."
                />
                <div className="surface p-8 text-center">
                    <p className="text-[15px] font-semibold text-hi">
                        Your dashboard needs two numbers to say anything true
                    </p>
                    <p className="text-[12.5px] text-lo mt-2 max-w-md mx-auto leading-relaxed">
                        What comes in each month, and what you must spend. Without both,
                        every figure on this page would be invented — so the page stays
                        empty instead.
                    </p>
                    <Link to="/onboarding" className="btn btn-primary !py-2.5 mt-6">
                        Add my numbers <ArrowRight size={14} />
                    </Link>
                </div>
            </>
        );
    }

    return (
        <>
            <PageHeader
                eyebrow={today}
                title="Overview"
                description="Computed from your own figures, repriced every three seconds."
                metric={{
                    label: 'Net worth',
                    value: money(score.netWorth),
                    delta: pct(portfolio.pnlPct),
                    up: portfolio.pnl >= 0,
                }}
            />

            <div className="space-y-4">
                {/* ─── The four headline figures ─── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat
                        label="Runway"
                        value={fmtMonths(runway.months)}
                        hint={`target ${runway.target.toFixed(0)} months`}
                        tone={runwayTone}
                        icon={Shield}
                    />
                    <Stat
                        label="Freedom Score"
                        value={`${score.total}`}
                        hint={score.yearsToFreedom >= 70 ? 'not on this path' : `free at ${Math.round(score.freedomAge)}`}
                        tone="accent"
                        icon={Compass}
                    />
                    <Stat
                        label="Monthly surplus"
                        value={money(score.surplus)}
                        hint={`${share(score.savingsRate * 100)} of in-hand`}
                        tone={score.surplus > 0 ? 'gain' : 'loss'}
                        icon={Wallet}
                    />
                    <Stat
                        label="Leaking a year"
                        value={moneyShort(leaks.totalAnnual)}
                        hint={`${moneyShort(leaks.recoverableNow)} recoverable`}
                        tone="loss"
                        icon={TrendingDown}
                    />
                </div>

                {/* ─── Runway ─── */}
                <RunwayHero runway={runway} projection={projection} />

                {/* ─── Portfolio: what's invested, and how it's doing ─── */}
                <PortfolioHero portfolio={portfolio} />

                {/* ─── Actions and losses, side by side ─── */}
                <div className="grid lg:grid-cols-2 gap-4 items-start">
                    <Card>
                        <CardHead
                            icon={Zap}
                            title="Next moves"
                            subtitle="Ranked by effect on your runway"
                            accent="var(--accent)"
                        />
                        <CardBody className="!p-0">
                            {levers.slice(0, 4).map((l, i) => {
                                const done = applied.includes(l.id);
                                return (
                                    <div
                                        key={l.id}
                                        className="p-4 min-w-0 transition-colors hover:bg-[var(--surface-2)]"
                                        style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-subtle)' }}
                                    >
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div
                                                className="w-6 h-6 rounded-full grid place-items-center shrink-0 mt-px num text-[11px] font-bold"
                                                style={
                                                    done
                                                        ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                                                        : { background: 'var(--surface-3)', color: 'var(--text-lo)' }
                                                }
                                            >
                                                {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p className={`text-[13px] font-semibold ${done ? 'text-faint line-through' : 'text-hi'}`}>
                                                    {l.label}
                                                </p>
                                                <p className="text-[11.5px] text-lo mt-1 leading-relaxed">
                                                    {l.detail}
                                                </p>

                                                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                                    {l.deltaMonths >= 0.05 && (
                                                        <Badge tone="gain">+{l.deltaMonths.toFixed(1)} mo</Badge>
                                                    )}
                                                    {l.deltaScore >= 1 && (
                                                        <Badge tone="info">+{l.deltaScore.toFixed(1)} pts</Badge>
                                                    )}
                                                    {l.cost < 0 && (
                                                        <span className="num text-[11px]" style={{ color: 'var(--gain)' }}>
                                                            frees {moneyShort(-l.cost)}/mo
                                                        </span>
                                                    )}
                                                    {!done && (
                                                        <button
                                                            onClick={() => applyLever(l.id)}
                                                            className="btn btn-secondary !py-1 !px-2.5 !text-[11px] ml-auto"
                                                        >
                                                            Apply <ArrowRight size={11} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </CardBody>
                    </Card>

                    <Card>
                        <CardHead
                            icon={Droplets}
                            title="Money leaving quietly"
                            subtitle={`${moneyShort(leaks.totalAnnual)} a year if nothing changes`}
                            accent="var(--loss)"
                        />
                        <CardBody className="!p-0">
                            {leaks.leaks.slice(0, 4).map((l, i) => (
                                <div
                                    key={l.id}
                                    className="p-4 min-w-0"
                                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-subtle)' }}
                                >
                                    <div className="flex items-start justify-between gap-3 min-w-0">
                                        <p className="text-[13px] font-semibold text-hi min-w-0">{l.label}</p>
                                        <p
                                            className="num text-[13px] font-semibold shrink-0"
                                            style={{ color: 'var(--loss)' }}
                                        >
                                            −{moneyShort(l.annualCost)}
                                        </p>
                                    </div>
                                    <p className="text-[11.5px] text-lo mt-1 leading-relaxed">{l.why}</p>
                                    <p className="text-[11.5px] text-mid mt-2 leading-relaxed">
                                        <span className="text-accent font-medium">Fix · </span>
                                        {l.fix}
                                    </p>
                                </div>
                            ))}
                        </CardBody>
                    </Card>
                </div>

                {/* ─── Freedom Score ─── */}
                <FreedomScore score={score} sim={sim} />

                {/* ─── Payday ─── */}
                <Card>
                    <CardHead
                        icon={Wallet}
                        title="Next payday"
                        subtitle={`${money(payday.income)} lands ${relativeDays(payday.daysToPayday)}`}
                        accent="var(--info)"
                        action={
                            <Link to="/dashboard/salary-splitting" className="btn btn-secondary !py-1 !px-3 !text-[11.5px]">
                                Adjust <ArrowRight size={12} />
                            </Link>
                        }
                    />
                    <CardBody>
                        <StackedMeter
                            segments={payday.slices.map((s) => ({
                                label: s.label,
                                value: s.amount,
                                color: s.color,
                            }))}
                            height={10}
                            className="mb-4"
                        />
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                            {payday.slices.map((s) => (
                                <div key={s.label} className="min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ background: s.color }}
                                            aria-hidden
                                        />
                                        <span className="text-[11px] text-lo truncate">{s.label}</span>
                                    </div>
                                    <p className="num text-[15px] font-semibold text-hi truncate">
                                        {money(s.amount)}
                                    </p>
                                    <p className="text-[10.5px] text-faint mt-0.5">
                                        {share((s.amount / (payday.income || 1)) * 100)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </CardBody>
                </Card>
            </div>
        </>
    );
}
