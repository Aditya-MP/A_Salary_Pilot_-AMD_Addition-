import { Receipt, Scale, Home, CalendarClock, Check, TrendingDown, Info } from 'lucide-react';
import { useFinancials } from '../hooks/useFinancials';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { Meter } from '../components/primitives/Meter';
import { Stat } from '../components/primitives/Stat';
import { Stagger, Item } from '../components/motion/Reveal';
import { money, moneyShort, share, daysLeftInFY, fyLabel } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   Tax Centre.

   The gap this fills: for a salaried Indian, tax is the single largest
   expense of their life — larger than rent, larger than any EMI — and
   it is handled once a year in a panic, usually by guessing. Meanwhile
   every finance app treats tax as a footnote on an investment screen.

   Three things here that a payslip and a mutual fund app between them
   will never tell you:

     1. Which regime actually wins for YOUR deductions, in rupees.
     2. How much deduction headroom is unused and what it is worth.
     3. Which of the three HRA limits is binding, so you know whether
        moving rent or restructuring basic would even help.
   ═══════════════════════════════════════════════════════════════════ */

export default function TaxCentre() {
    const { regimes, headroom, profile } = useFinancials();
    const daysLeft = daysLeftInFY();
    const fy = fyLabel();

    const winnerResult = regimes.winner === 'old' ? regimes.old : regimes.new;

    return (
        <>
            <PageHeader
                eyebrow={`${fy} · ${daysLeft} days left`}
                title="Tax Centre"
                description="Your largest lifetime expense, treated like one. Everything below runs on your actual salary and declarations."
                metric={{
                    label: 'Tax this year',
                    value: money(winnerResult.total),
                    delta: `${share(winnerResult.effective, 1)} effective`,
                    up: false,
                }}
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <Stat
                    label="Better regime"
                    value={regimes.winner === 'old' ? 'Old' : 'New'}
                    hint={`saves ${money(regimes.saving)}`}
                    tone="accent"
                    icon={Scale}
                />
                <Stat
                    label="Marginal rate"
                    value={share(winnerResult.marginal * 100, 1)}
                    hint="what the next ₹1 costs"
                    icon={TrendingDown}
                />
                <Stat
                    label="Unused deductions"
                    value={money(headroom.totalUnused)}
                    hint="headroom still open"
                    tone="warn"
                    icon={Receipt}
                />
                <Stat
                    label="Leaving on the table"
                    value={money(headroom.totalWorth)}
                    hint="if you do nothing"
                    tone="loss"
                    icon={CalendarClock}
                />
            </div>

            <div className="space-y-5">
                {/* ═══ Regime comparison ═══ */}
                <Card>
                    <CardHead
                        icon={Scale}
                        title="Old regime vs new regime"
                        subtitle="Run against your real deductions, not a generic example"
                        accent="var(--accent)"
                    />
                    <CardBody>
                        <div className="grid sm:grid-cols-2 gap-4">
                            {[regimes.old, regimes.new].map((r) => {
                                const wins = r.regime === regimes.winner;
                                return (
                                    <div
                                        key={r.regime}
                                        className="p-4 rounded-[var(--r-md)] relative"
                                        style={{
                                            background: wins ? 'var(--gain-dim)' : 'var(--surface-3)',
                                            border: `1px solid ${wins ? 'var(--accent)' : 'var(--line)'}`,
                                        }}
                                    >
                                        {wins && (
                                            <div className="absolute top-3 right-3">
                                                <Badge tone="gain" icon={Check}>Better for you</Badge>
                                            </div>
                                        )}

                                        <p className="label mb-2">
                                            {r.regime === 'old' ? 'Old regime' : 'New regime'}
                                        </p>
                                        <p className="num text-2xl font-semibold text-hi">
                                            {money(r.total)}
                                        </p>
                                        <p className="text-[11px] text-faint mt-0.5">
                                            {share(r.effective, 2)} of gross income
                                        </p>

                                        <div className="mt-4 space-y-1.5 pt-3" style={{ borderTop: '1px solid var(--line-subtle)' }}>
                                            {[
                                                ['Gross income', money(r.gross)],
                                                ['Deductions allowed', `−${money(r.deductionsAllowed)}`],
                                                ['Taxable', money(r.taxable)],
                                                ['Tax + 4% cess', money(r.total)],
                                            ].map(([k, v]) => (
                                                <div key={k} className="flex justify-between text-[12px]">
                                                    <span className="text-lo">{k}</span>
                                                    <span className="num text-hi font-medium">{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div
                            className="mt-4 p-4 rounded-[var(--r-md)] flex items-start gap-3"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
                        >
                            <Info size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--info)' }} />
                            <div className="text-[12.5px] text-lo leading-relaxed">
                                <p>
                                    The <span className="text-hi font-semibold">{regimes.winner} regime</span> saves you{' '}
                                    <span className="num font-semibold" style={{ color: 'var(--gain)' }}>
                                        {money(regimes.saving)}
                                    </span>{' '}
                                    this year — that is {moneyShort(regimes.saving / 12)} a month you would
                                    otherwise hand over for nothing.
                                </p>
                                {regimes.breakEvenDeductions > 0 && (
                                    <p className="mt-2">
                                        The old regime would overtake it if you claimed{' '}
                                        <span className="num font-semibold text-hi">
                                            {money(regimes.breakEvenDeductions)}
                                        </span>{' '}
                                        more in deductions. Worth knowing before you lock in your
                                        declaration — you have {headroom.totalUnused > 0 ? `${money(headroom.totalUnused)} of headroom sitting unused` : 'no headroom left'}.
                                    </p>
                                )}
                            </div>
                        </div>
                    </CardBody>
                </Card>

                {/* ═══ Deduction headroom ═══ */}
                <Card>
                    <CardHead
                        icon={Receipt}
                        title="Deduction headroom"
                        subtitle={`${daysLeft} days to use it — none of this carries into next year`}
                        accent="var(--warn)"
                        action={<Badge tone="warn">{money(headroom.totalWorth)} at stake</Badge>}
                    />
                    <CardBody className="!p-0">
                        <Stagger>
                            {headroom.slots.map((h, i) => (
                                <Item key={h.section}>
                                    <div
                                        className="p-4"
                                        style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-subtle)' }}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-2.5 flex-wrap">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-[13.5px] font-semibold text-hi">{h.label}</p>
                                                    {h.unused === 0 && <Badge tone="gain" icon={Check}>Maxed</Badge>}
                                                    {h.urgent && <Badge tone="warn">Act on this</Badge>}
                                                </div>
                                                <p className="text-[11.5px] text-faint mt-1">{h.note}</p>
                                            </div>

                                            {h.unused > 0 && (
                                                <div className="text-right shrink-0">
                                                    <p className="num text-[15px] font-semibold" style={{ color: 'var(--gain)' }}>
                                                        +{money(h.worth)}
                                                    </p>
                                                    <p className="text-[10px] text-faint">tax you'd save</p>
                                                </div>
                                            )}
                                        </div>

                                        <Meter
                                            value={h.used}
                                            max={h.limit}
                                            color={h.unused === 0 ? 'var(--gain)' : h.urgent ? 'var(--warn)' : 'var(--info)'}
                                            height={9}
                                            trailing={`${money(h.used)} / ${money(h.limit)}`}
                                        />

                                        {h.unused > 0 && (
                                            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                                <span className="text-[11.5px] text-lo">
                                                    {money(h.unused)} unused — fill with:
                                                </span>
                                                {h.fillers.slice(0, 3).map((f) => (
                                                    <Badge key={f} tone="muted">{f}</Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </Item>
                            ))}
                        </Stagger>
                    </CardBody>
                </Card>

                {/* ═══ HRA ═══ */}
                <Card>
                    <CardHead
                        icon={Home}
                        title="HRA exemption"
                        subtitle="Three statutory limits — you get the smallest, and knowing which one binds tells you what to change"
                        accent="var(--info)"
                    />
                    <CardBody>
                        <div className="space-y-3">
                            {regimes.hra.parts.map((p) => (
                                <div
                                    key={p.label}
                                    className="flex items-center justify-between gap-3 p-3 rounded-[var(--r-md)]"
                                    style={{
                                        background: p.winner ? 'var(--info-dim)' : 'var(--surface-3)',
                                        border: `1px solid ${p.winner ? 'rgba(56,189,248,0.3)' : 'var(--line-subtle)'}`,
                                    }}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        {p.winner && (
                                            <Badge tone="info">Binding</Badge>
                                        )}
                                        <span className="text-[12.5px] text-hi truncate">{p.label}</span>
                                    </div>
                                    <span className="num text-[13px] font-semibold text-hi shrink-0">
                                        {money(p.value)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div
                            className="mt-4 p-4 rounded-[var(--r-md)]"
                            style={{ background: 'var(--gain-dim)', border: '1px solid rgba(0,232,134,0.2)' }}
                        >
                            <div className="flex items-baseline justify-between gap-3 mb-1.5">
                                <span className="label">Your exemption</span>
                                <span className="num text-xl font-semibold" style={{ color: 'var(--gain)' }}>
                                    {money(regimes.hra.exempt)}
                                </span>
                            </div>
                            <p className="text-[12px] text-lo leading-relaxed">
                                Worth about{' '}
                                <span className="num font-semibold text-hi">
                                    {money(regimes.hra.exempt * regimes.old.marginal)}
                                </span>{' '}
                                in tax under the old regime. Remember: if annual rent crosses ₹1
                                lakh you must give your landlord's PAN, and HRA is not available
                                at all under the new regime.
                            </p>
                        </div>

                        <p className="text-[11.5px] text-faint mt-3 leading-relaxed">
                            Paying {money(profile.income.rentPaid)}/month rent against{' '}
                            {money(profile.income.hraReceived)}/month HRA on a{' '}
                            {money(profile.income.basic)} basic, in a{' '}
                            {profile.income.metro ? 'metro' : 'non-metro'} city.
                        </p>
                    </CardBody>
                </Card>
            </div>
        </>
    );
}
