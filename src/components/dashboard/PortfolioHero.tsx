import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Briefcase, ArrowRight, PiggyBank } from 'lucide-react';
import type { PortfolioSummary } from '../../engine/portfolioEngine';
import { money, moneyShort, pct, share } from '../../lib/format';
import { AnimatedNumber } from '../motion/AnimatedNumber';
import { StackedMeter } from '../primitives/Meter';

/* ═══════════════════════════════════════════════════════════════════
   Portfolio card for the Overview.

   Runway answers "what happens if income stops" — this answers the
   other half of "how am I doing": what's actually invested, what it's
   worth now, and whether it's working. Same two-panel shape as
   RunwayHero (headline + breakdown on the left, a chart-shaped view on
   the right) so the two read as a pair rather than two different apps
   stitched together.

   No holdings is not a zero to report confidently — it's a different
   screen entirely, pointing at where to start.
   ═══════════════════════════════════════════════════════════════════ */

export function PortfolioHero({ portfolio }: { portfolio: PortfolioSummary }) {
    if (portfolio.invested <= 0) {
        return (
            <section className="surface p-6 text-center">
                <PiggyBank size={22} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} aria-hidden />
                <p className="text-[14px] font-semibold text-hi">Nothing invested yet</p>
                <p className="text-[12.5px] text-lo mt-1.5 max-w-sm mx-auto leading-relaxed">
                    Once money moves into an investment from your wallet, its performance
                    shows up here — invested, current value, and return, tracked live.
                </p>
                <Link to="/dashboard/invest" className="btn btn-primary !py-2.5 mt-4">
                    Start investing <ArrowRight size={14} />
                </Link>
            </section>
        );
    }

    const gain = portfolio.pnl >= 0;
    const tone = gain ? 'var(--gain)' : 'var(--loss)';
    const rows = [...portfolio.allocation].filter((a) => a.value > 0);

    return (
        <section className="surface grid lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] overflow-hidden">
            {/* ─── The number ─── */}
            <div
                className="p-5 min-w-0 border-b lg:border-b-0 lg:border-r"
                style={{ borderColor: 'var(--line-subtle)' }}
            >
                <div className="flex items-center gap-2 mb-3">
                    {gain ? (
                        <TrendingUp size={14} style={{ color: tone }} aria-hidden />
                    ) : (
                        <TrendingDown size={14} style={{ color: tone }} aria-hidden />
                    )}
                    <span className="label" style={{ color: tone }}>
                        Portfolio · {gain ? 'Up' : 'Down'}
                    </span>
                </div>

                <div className="flex items-baseline gap-2 flex-wrap">
                    <AnimatedNumber
                        value={portfolio.current}
                        format={(v) => money(v)}
                        className="num text-[32px] font-semibold leading-none tracking-tight text-hi"
                    />
                </div>

                <p className="text-[12.5px] mt-2.5 leading-relaxed">
                    <span className="num font-semibold" style={{ color: tone }}>
                        {gain ? '+' : ''}{money(portfolio.pnl)} · {pct(portfolio.pnlPct)}
                    </span>{' '}
                    <span className="text-lo">on {money(portfolio.invested)} invested</span>
                </p>

                <div
                    className="mt-4 pt-4 grid grid-cols-2 gap-x-3 gap-y-3"
                    style={{ borderTop: '1px solid var(--line-subtle)' }}
                >
                    {[
                        { l: 'Invested', v: moneyShort(portfolio.invested), t: 'var(--text-hi)' },
                        {
                            l: 'Annualised', v: pct(portfolio.annualised),
                            t: portfolio.annualised >= 0 ? 'var(--gain)' : 'var(--loss)',
                        },
                        { l: "You'd keep after tax", v: moneyShort(portfolio.netIfLiquidated), t: 'var(--text-hi)' },
                        { l: 'Positions', v: `${portfolio.holdings.length}`, t: 'var(--text-faint)' },
                    ].map((s) => (
                        <div key={s.l} className="min-w-0">
                            <p className="label mb-1 truncate">{s.l}</p>
                            <p className="num text-[14px] font-semibold truncate" style={{ color: s.t }}>
                                {s.v}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ─── Allocation, at a glance ─── */}
            <div className="p-5 min-w-0 flex flex-col">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <p className="label">Where it's sitting</p>
                    <Link
                        to="/dashboard/portfolio"
                        className="text-[11.5px] font-medium inline-flex items-center gap-1"
                        style={{ color: 'var(--accent)' }}
                    >
                        Full breakdown <ArrowRight size={11} />
                    </Link>
                </div>

                <StackedMeter
                    segments={rows.map((a) => ({ label: a.label, value: a.value, color: a.color }))}
                    height={10}
                    className="mb-4"
                />

                <div className="space-y-2.5 flex-1 overflow-y-auto">
                    {rows.map((a) => (
                        <div key={a.assetClass} className="flex items-center justify-between gap-3 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ background: a.color }}
                                    aria-hidden
                                />
                                <span className="text-[12.5px] text-hi truncate">{a.label}</span>
                            </div>
                            <div className="flex items-baseline gap-2.5 shrink-0">
                                <span className="num text-[11px] text-faint">{share(a.weight, 1)}</span>
                                <span className="num text-[12.5px] font-semibold text-hi">{moneyShort(a.value)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {portfolio.biggestPosition && (
                    <div
                        className="mt-4 pt-3.5 flex items-center gap-2.5"
                        style={{ borderTop: '1px solid var(--line-subtle)' }}
                    >
                        <Briefcase size={13} style={{ color: 'var(--text-faint)' }} aria-hidden />
                        <p className="text-[11.5px] text-lo leading-snug">
                            <span className="text-hi font-medium">{portfolio.biggestPosition.holding.label}</span>{' '}
                            is your largest position, at {share(portfolio.biggestPosition.weight, 1)} of everything you own.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}
