import { useState } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
    CartesianGrid, ReferenceLine,
} from 'recharts';
import {
    Briefcase, Scale, Droplet, Receipt, Lock, AlertTriangle,
    TrendingUp, TrendingDown, Layers, Info,
} from 'lucide-react';
import { useFinancials } from '../hooks/useFinancials';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { Stat } from '../components/primitives/Stat';
import { Segmented } from '../components/primitives/Segmented';
import { Meter } from '../components/primitives/Meter';
import { Stagger, Item } from '../components/motion/Reveal';
import { Sparkline } from '../components/charts/Sparkline';
import { syntheticSeries } from '../lib/series';
import { AXIS, GRID, TOOLTIP } from '../components/charts/chartTheme';
import { money, moneyShort, pct, share } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   Portfolio.

   The previous version showed three bars (equity/crypto/ESG), a
   hardcoded "risk exposure" of 30/45/25 that was not derived from
   anything, and four fabricated performance numbers.

   Four views here, and each answers a question a generic portfolio
   screen does not:

     Positions  — which holding is carrying this, and which is bleeding it
     Allocation — how far you have drifted, and the rupees to fix it
     Liquidity  — how much of this you could actually reach in a crisis
     Tax        — what you keep after selling, and what you can harvest
   ═══════════════════════════════════════════════════════════════════ */

type View = 'positions' | 'allocation' | 'liquidity' | 'tax';

export default function Portfolio() {
    const { portfolio, profile } = useFinancials();
    const [view, setView] = useState<View>('positions');

    const taxDrag = portfolio.current > 0
        ? (portfolio.taxIfLiquidated / portfolio.current) * 100
        : 0;

    return (
        <>
            <PageHeader
                eyebrow="Holdings"
                title="Portfolio"
                description={`${portfolio.holdings.length} positions across ${portfolio.allocation.length} asset classes, priced live.`}
                metric={{
                    label: 'Current value',
                    value: money(portfolio.current),
                    delta: pct(portfolio.pnlPct),
                    up: portfolio.pnl >= 0,
                }}
            />

            {/* ─── The four numbers that matter, including the one
                   nobody else shows: what you keep after tax. ─── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <Stat
                    label="Invested"
                    value={money(portfolio.invested)}
                    hint="your own money in"
                    icon={Briefcase}
                />
                <Stat
                    label="Unrealised P&L"
                    value={money(portfolio.pnl)}
                    delta={pct(portfolio.pnlPct)}
                    up={portfolio.pnl >= 0}
                    tone={portfolio.pnl >= 0 ? 'gain' : 'loss'}
                    icon={portfolio.pnl >= 0 ? TrendingUp : TrendingDown}
                />
                <Stat
                    label="Annualised"
                    value={pct(portfolio.annualised)}
                    hint="money-weighted"
                    tone={portfolio.annualised >= 0 ? 'gain' : 'loss'}
                    icon={Scale}
                />
                <Stat
                    label="You'd keep after tax"
                    value={money(portfolio.netIfLiquidated)}
                    hint={`${money(portfolio.taxIfLiquidated)} to the taxman`}
                    tone="warn"
                    icon={Receipt}
                />
            </div>

            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <Segmented<View>
                    value={view}
                    onChange={setView}
                    options={[
                        { value: 'positions', label: 'Positions', icon: Layers },
                        { value: 'allocation', label: 'Allocation', icon: Scale },
                        { value: 'liquidity', label: 'Liquidity', icon: Droplet },
                        { value: 'tax', label: 'Tax', icon: Receipt },
                    ]}
                />
                {taxDrag > 5 && (
                    <Badge tone="warn" icon={Info}>
                        {share(taxDrag, 1)} of this portfolio is the tax bill
                    </Badge>
                )}
            </div>

            {view === 'positions' && <Positions portfolio={portfolio} />}
            {view === 'allocation' && <Allocation portfolio={portfolio} risk={profile.risk} />}
            {view === 'liquidity' && <Liquidity portfolio={portfolio} />}
            {view === 'tax' && <TaxView portfolio={portfolio} />}
        </>
    );
}

/* ═══════════════════ POSITIONS ═══════════════════ */

function Positions({ portfolio }: { portfolio: ReturnType<typeof useFinancials>['portfolio'] }) {
    const rows = [...portfolio.holdings].sort((a, b) => b.current - a.current);

    return (
        <div className="space-y-5">
            {/* Contribution: which holdings actually made the money.
                A ranked bar beats a pie here — a pie shows size, this
                shows who is responsible for the result. */}
            <Card>
                <CardHead
                    icon={TrendingUp}
                    title="Who is carrying this portfolio"
                    subtitle="Profit and loss by position, in rupees"
                />
                <CardBody>
                    <div className="h-[220px] -ml-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={rows
                                    .filter((r) => Math.abs(r.pnl) > 100)
                                    .map((r) => ({ name: r.holding.ticker, pnl: Math.round(r.pnl) }))}
                                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                            >
                                <CartesianGrid {...GRID} />
                                <XAxis dataKey="name" {...AXIS} angle={-35} textAnchor="end" height={52} interval={0} />
                                <YAxis {...AXIS} width={48} tickFormatter={(v) => moneyShort(v)} />
                                <Tooltip {...TOOLTIP} formatter={((v: number) => [money(v), 'P&L']) as never} />
                                <ReferenceLine y={0} stroke="var(--line-strong)" />
                                <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={34}>
                                    {rows
                                        .filter((r) => Math.abs(r.pnl) > 100)
                                        .map((r) => (
                                            <Cell
                                                key={r.holding.id}
                                                fill={r.pnl >= 0 ? 'var(--gain)' : 'var(--loss)'}
                                            />
                                        ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 mt-4">
                        {portfolio.topContributor && (
                            <div className="well p-3">
                                <p className="label mb-1">Biggest contributor</p>
                                <p className="text-[13px] font-semibold text-hi">
                                    {portfolio.topContributor.holding.label}
                                </p>
                                <p className="num text-[12px] mt-0.5" style={{ color: 'var(--gain)' }}>
                                    {money(portfolio.topContributor.pnl)} · {pct(portfolio.topContributor.pnlPct)}
                                </p>
                            </div>
                        )}
                        {portfolio.topDetractor && portfolio.topDetractor.pnl < 0 && (
                            <div className="well p-3">
                                <p className="label mb-1">Biggest drag</p>
                                <p className="text-[13px] font-semibold text-hi">
                                    {portfolio.topDetractor.holding.label}
                                </p>
                                <p className="num text-[12px] mt-0.5" style={{ color: 'var(--loss)' }}>
                                    {money(portfolio.topDetractor.pnl)} · {pct(portfolio.topDetractor.pnlPct)}
                                </p>
                            </div>
                        )}
                    </div>
                </CardBody>
            </Card>

            {/* The holdings table */}
            <Card>
                <CardHead icon={Layers} title="All positions" subtitle="Live prices, updated every 3 seconds" />
                <div className="scroll-x">
                    <table className="w-full text-left" style={{ minWidth: 780 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                                {['Holding', 'Trend', 'Weight', 'Invested', 'Value', 'P&L', 'If sold today'].map((h, i) => (
                                    <th
                                        key={h}
                                        className={`label px-4 py-2.5 font-semibold ${i > 1 ? 'text-right' : ''}`}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr
                                    key={r.holding.id}
                                    className="transition-colors hover:bg-[var(--surface-2)]"
                                    style={{ borderBottom: '1px solid var(--line-subtle)' }}
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-medium text-hi truncate">
                                                    {r.holding.label}
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                    <span className="num text-[10.5px] text-faint">
                                                        {r.holding.ticker}
                                                    </span>
                                                    {r.locked ? (
                                                        <Badge tone="muted" icon={Lock}>
                                                            {Math.round(r.lockDaysLeft / 30)}mo lock
                                                        </Badge>
                                                    ) : (
                                                        <Badge tone={r.longTerm ? 'gain' : 'warn'}>
                                                            {r.longTerm ? 'LTCG' : 'STCG'}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Sparkline
                                            data={syntheticSeries(r.holding.ticker, 20, r.pnlPct)}
                                            width={64}
                                            height={20}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-right num text-[12.5px] text-lo">
                                        {share(r.weight, 1)}
                                    </td>
                                    <td className="px-4 py-3 text-right num text-[12.5px] text-lo">
                                        {moneyShort(r.invested)}
                                    </td>
                                    <td className="px-4 py-3 text-right num text-[12.5px] font-semibold text-hi">
                                        {moneyShort(r.current)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <p
                                            className="num text-[12.5px] font-semibold"
                                            style={{ color: r.pnl >= 0 ? 'var(--gain)' : 'var(--loss)' }}
                                        >
                                            {moneyShort(r.pnl)}
                                        </p>
                                        <p
                                            className="num text-[10.5px]"
                                            style={{ color: r.pnl >= 0 ? 'var(--gain)' : 'var(--loss)', opacity: 0.7 }}
                                        >
                                            {pct(r.pnlPct)}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {r.locked ? (
                                            <span className="text-[11px] text-faint">locked</span>
                                        ) : (
                                            <>
                                                <p className="num text-[12.5px] font-semibold text-hi">
                                                    {moneyShort(r.netIfSold)}
                                                </p>
                                                {r.taxIfSold > 0 && (
                                                    <p className="num text-[10.5px]" style={{ color: 'var(--warn)' }}>
                                                        −{moneyShort(r.taxIfSold)} tax
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

/* ═══════════════════ ALLOCATION ═══════════════════ */

function Allocation({
    portfolio,
    risk,
}: {
    portfolio: ReturnType<typeof useFinancials>['portfolio'];
    risk: string;
}) {
    const drifted = portfolio.allocation.filter((a) => Math.abs(a.drift) > 3);

    return (
        <div className="space-y-5">
            <Card>
                <CardHead
                    icon={Scale}
                    title="Drift from your target"
                    subtitle={`Against the ${risk} model allocation`}
                    action={
                        drifted.length > 0 ? (
                            <Badge tone="warn">{drifted.length} off target</Badge>
                        ) : (
                            <Badge tone="gain">On target</Badge>
                        )
                    }
                />
                <CardBody className="space-y-5">
                    {portfolio.allocation.map((a) => (
                        <div key={a.assetClass}>
                            <div className="flex items-baseline justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                                        style={{ background: a.color }}
                                        aria-hidden
                                    />
                                    <span className="text-[13px] font-medium text-hi">{a.label}</span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <span className="num text-[12px] text-lo">
                                        {share(a.weight, 1)}
                                        <span className="text-faint"> of {share(a.target, 0)}</span>
                                    </span>
                                    <span className="num text-[12px] font-semibold text-hi">
                                        {moneyShort(a.value)}
                                    </span>
                                </div>
                            </div>

                            {/* Bar with the target as a tick — this is the whole
                                point: you can see where you are AND where you
                                said you wanted to be. */}
                            <Meter
                                value={a.weight}
                                max={Math.max(60, a.target * 1.6)}
                                target={a.target}
                                color={a.color}
                                height={9}
                            />

                            {Math.abs(a.drift) > 3 && (
                                <p className="text-[11.5px] mt-1.5" style={{ color: a.drift > 0 ? 'var(--warn)' : 'var(--info)' }}>
                                    {a.drift > 0 ? 'Overweight' : 'Underweight'} by {share(Math.abs(a.drift), 1)} —{' '}
                                    {a.drift > 0 ? 'trim' : 'add'} about{' '}
                                    <span className="num font-semibold">{money(Math.abs(a.rebalance))}</span>
                                </p>
                            )}
                        </div>
                    ))}
                </CardBody>
            </Card>

            {/* Concentration — a genuine risk almost no retail app surfaces. */}
            <Card>
                <CardHead icon={AlertTriangle} title="Concentration check" accent="var(--warn)" />
                <CardBody>
                    <div className="flex items-start gap-5 flex-wrap">
                        <div>
                            <p className="label mb-1.5">Concentration index</p>
                            <p
                                className="num text-3xl font-semibold"
                                style={{
                                    color:
                                        portfolio.concentration > 25 ? 'var(--loss)'
                                            : portfolio.concentration > 15 ? 'var(--warn)'
                                                : 'var(--gain)',
                                }}
                            >
                                {portfolio.concentration.toFixed(1)}
                            </p>
                            <p className="text-[11px] text-faint mt-1">
                                below 15 is well spread
                            </p>
                        </div>

                        <div className="flex-1 min-w-[240px]">
                            <p className="text-[12.5px] text-lo leading-relaxed">
                                {portfolio.concentration > 25
                                    ? 'Your result now depends heavily on one or two positions. That is a bet, not a portfolio.'
                                    : portfolio.concentration > 15
                                        ? 'Reasonably spread, but a couple of positions still dominate the outcome.'
                                        : 'Well spread. No single position can badly hurt you.'}
                            </p>
                            {portfolio.biggestPosition && (
                                <div className="well p-3 mt-3">
                                    <p className="label mb-1">Largest single position</p>
                                    <p className="text-[13px] font-semibold text-hi">
                                        {portfolio.biggestPosition.holding.label}
                                    </p>
                                    <p className="num text-[12px] text-lo mt-0.5">
                                        {share(portfolio.biggestPosition.weight, 1)} of everything you own
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
}

/* ═══════════════════ LIQUIDITY ═══════════════════ */

function Liquidity({ portfolio }: { portfolio: ReturnType<typeof useFinancials>['portfolio'] }) {
    const total = portfolio.ladder.reduce((s, b) => s + b.value, 0) || 1;

    const BAND_COLOR = ['var(--gain)', 'var(--series-6)', 'var(--info)', 'var(--warn)', 'var(--text-faint)'];

    return (
        <Card>
            <CardHead
                icon={Droplet}
                title="How fast can you reach this money?"
                subtitle="The question that matters in an emergency, and the one net worth never answers"
            />
            <CardBody>
                <Stagger className="space-y-4">
                    {portfolio.ladder.map((b, i) => (
                        <Item key={b.band}>
                            <div>
                                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                                    <span className="text-[13px] font-medium text-hi">{b.band}</span>
                                    <div className="flex items-baseline gap-2.5">
                                        <span className="num text-[11.5px] text-faint">
                                            {share((b.value / total) * 100, 1)}
                                        </span>
                                        <span className="num text-[13px] font-semibold text-hi">
                                            {money(b.value)}
                                        </span>
                                    </div>
                                </div>
                                <Meter
                                    value={b.value}
                                    max={total}
                                    color={BAND_COLOR[i]}
                                    height={10}
                                />
                            </div>
                        </Item>
                    ))}
                </Stagger>

                <div
                    className="mt-5 p-4 rounded-[var(--r-md)] flex items-start gap-3"
                    style={{ background: 'var(--warn-dim)', border: '1px solid rgba(255,176,32,0.2)' }}
                >
                    <Lock size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--warn)' }} />
                    <div>
                        <p className="text-[13px] font-semibold text-hi mb-1">
                            {money(portfolio.ladder[4]?.value ?? 0)} of this is locked
                        </p>
                        <p className="text-[12px] text-lo leading-relaxed">
                            PPF, NPS and ELSS inside their lock-in. It is genuine wealth and it
                            will compound beautifully — but if you lost your job next month you
                            could not touch a rupee of it. Count it toward retirement, never
                            toward your emergency buffer.
                        </p>
                    </div>
                </div>
            </CardBody>
        </Card>
    );
}

/* ═══════════════════ TAX ═══════════════════ */

function TaxView({ portfolio }: { portfolio: ReturnType<typeof useFinancials>['portfolio'] }) {
    return (
        <div className="space-y-5">
            <Card>
                <CardHead
                    icon={Receipt}
                    title="What you actually walk away with"
                    subtitle="Screen value minus the tax on every gain"
                />
                <CardBody>
                    <div className="grid sm:grid-cols-3 gap-px rounded-[var(--r-md)] overflow-hidden"
                        style={{ background: 'var(--line-subtle)' }}>
                        {[
                            { label: 'Sellable value', value: money(portfolio.current), tone: 'var(--text-hi)' },
                            { label: 'Capital gains tax', value: `−${money(portfolio.taxIfLiquidated)}`, tone: 'var(--loss)' },
                            { label: 'In your bank', value: money(portfolio.netIfLiquidated), tone: 'var(--gain)' },
                        ].map((s) => (
                            <div key={s.label} className="p-4" style={{ background: 'var(--surface-1)' }}>
                                <p className="label mb-1.5">{s.label}</p>
                                <p className="num text-lg font-semibold" style={{ color: s.tone }}>
                                    {s.value}
                                </p>
                            </div>
                        ))}
                    </div>

                    <p className="text-[12px] text-lo leading-relaxed mt-4">
                        Equity held over a year is taxed at 12.5% beyond the ₹1.25L annual
                        exemption; under a year it is 20%. Crypto is a flat 30% with no
                        holding-period relief and no loss set-off. Holding an equity position a
                        few weeks longer to cross the one-year line is often worth more than
                        any timing decision you will make.
                    </p>
                </CardBody>
            </Card>

            <Card>
                <CardHead
                    icon={Scale}
                    title="Tax-loss harvesting"
                    subtitle="Realise losses to cancel gains — legal, routine, and almost always missed"
                    accent="var(--accent)"
                    action={
                        portfolio.harvestSaving > 0 ? (
                            <Badge tone="gain">Save {money(portfolio.harvestSaving)}</Badge>
                        ) : (
                            <Badge tone="muted">Nothing to harvest</Badge>
                        )
                    }
                />
                <CardBody>
                    {portfolio.harvestable.length > 0 ? (
                        <>
                            <div className="space-y-3">
                                {portfolio.harvestable.map((h) => (
                                    <div key={h.view.holding.id} className="well p-3.5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-semibold text-hi">
                                                    {h.view.holding.label}
                                                </p>
                                                <p className="num text-[11.5px] mt-0.5" style={{ color: 'var(--loss)' }}>
                                                    sitting on {money(h.view.pnl)} ({pct(h.view.pnlPct)})
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="num text-[13px] font-semibold" style={{ color: 'var(--gain)' }}>
                                                    +{money(h.saves)}
                                                </p>
                                                <p className="text-[10px] text-faint">tax saved</p>
                                            </div>
                                        </div>
                                        <p className="text-[11.5px] text-lo mt-2 leading-relaxed">
                                            Selling cancels {money(h.offsets)} of gains elsewhere. You can buy
                                            it back the next day — India has no wash-sale rule — so your
                                            position survives and only the tax bill changes.
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div
                                className="mt-4 p-3.5 rounded-[var(--r-md)]"
                                style={{ background: 'var(--gain-dim)', border: '1px solid rgba(0,232,134,0.2)' }}
                            >
                                <p className="text-[12.5px] text-mid leading-relaxed">
                                    <span className="font-semibold text-hi">Worth {money(portfolio.harvestSaving)} this
                                        financial year.</span>{' '}
                                    Do it before 31 March — the opportunity does not carry over.
                                </p>
                            </div>
                        </>
                    ) : (
                        <p className="text-[12.5px] text-lo">
                            No position is currently at a loss that could offset a gain. This is a
                            good problem to have — we will flag it the moment one appears.
                        </p>
                    )}
                </CardBody>
            </Card>
        </div>
    );
}
