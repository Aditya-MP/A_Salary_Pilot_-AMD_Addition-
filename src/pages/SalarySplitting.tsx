import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Wallet, Sparkles, SlidersHorizontal, ArrowRight, Shield,
    TrendingUp, Info, Lock, CalendarClock,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useFinancials } from '../hooks/useFinancials';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { Segmented } from '../components/primitives/Segmented';
import { StackedMeter } from '../components/primitives/Meter';
import { money, share, relativeDays } from '../lib/format';
import type { RiskType } from '../domain/types';

/* ═══════════════════════════════════════════════════════════════════
   Salary Routing.

   The old page asked for a salary figure and then split it into
   needs / wants / investments with three sliders. The problem: those
   three buckets are a textbook abstraction, and no salaried person's
   money actually works that way. Rent and an EMI are not "needs" in
   the same sense that groceries are — one is a fixed contractual
   obligation you cannot flex, the other you can.

   So the split now runs against the real expense list, and the only
   genuinely free variable — how much gets swept into investments on
   payday — is the one thing you actually control. The rest is shown
   as what it is: already spoken for.
   ═══════════════════════════════════════════════════════════════════ */

const PRESETS: Record<RiskType, { investPct: number; label: string; blurb: string; color: string }> = {
    conservative: {
        investPct: 12,
        label: 'Conservative',
        blurb: 'Buffer first. Slower growth, far fewer bad months.',
        color: 'var(--info)',
    },
    balanced: {
        investPct: 20,
        label: 'Balanced',
        blurb: 'The rate most people can actually sustain for years.',
        color: 'var(--accent)',
    },
    aggressive: {
        investPct: 32,
        label: 'Aggressive',
        blurb: 'Fast, and it only works if your runway is already safe.',
        color: 'var(--warn)',
    },
};

export default function SalarySplitting() {
    const navigate = useNavigate();
    const { profile, runway, payday, score } = useFinancials();

    const split = useAppStore((s) => s.split);
    const setSplit = useAppStore((s) => s.setSplit);
    const risk = useAppStore((s) => s.risk);
    const setRisk = useAppStore((s) => s.setRisk);
    const setSalary = useAppStore((s) => s.setSalary);

    const [mode, setMode] = useState<'auto' | 'manual'>('auto');
    const [salary, setLocalSalary] = useState(profile.income.inHand);

    const committed = payday.slices
        .filter((s) => s.kind === 'locked')
        .reduce((s, x) => s + x.amount, 0);

    const maxInvestable = Math.max(0, salary - committed);
    const maxPct = salary > 0 ? Math.floor((maxInvestable / salary) * 100) : 0;

    const investPct = mode === 'auto' ? PRESETS[risk].investPct : split.investments;
    const investAmount = Math.round((salary * investPct) / 100);
    const overCommitted = investAmount > maxInvestable;

    const apply = () => {
        setSalary(salary);
        setSplit({
            investments: investPct,
            needs: Math.round((committed / salary) * 100),
            wants: Math.max(0, 100 - investPct - Math.round((committed / salary) * 100)),
        });
        navigate('/dashboard/triple-guard');
    };

    /* Where the invested rupee should go, given the runway state. This
       is the recommendation that most apps get backwards — they push
       equity regardless of whether the user has a buffer. */
    const bufferFirst = runway.months < runway.target;
    const destinations = bufferFirst
        ? [
            { label: 'Liquid fund — emergency buffer', pct: 60, color: 'var(--accent)', note: 'until runway hits target' },
            { label: 'Index equity SIP', pct: 25, color: 'var(--series-2)', note: 'long horizon' },
            { label: 'ELSS — 80C', pct: 15, color: 'var(--series-4)', note: '3-year lock-in' },
        ]
        : [
            { label: 'Index equity SIP', pct: 50, color: 'var(--series-2)', note: 'core growth' },
            { label: 'ELSS — 80C', pct: 20, color: 'var(--series-4)', note: 'tax + growth' },
            { label: 'NPS — 80CCD(1B)', pct: 15, color: 'var(--series-3)', note: 'extra ₹50k deduction' },
            { label: 'Debt / gold', pct: 15, color: 'var(--series-6)', note: 'ballast' },
        ];

    return (
        <>
            <PageHeader
                eyebrow={`Payday ${relativeDays(payday.daysToPayday)}`}
                title="Salary Routing"
                description="Only one number here is genuinely yours to choose. The rest is already committed before the money lands."
                metric={{
                    label: 'Free to allocate',
                    value: money(maxInvestable),
                    delta: `${share(maxPct)} of in-hand`,
                    up: true,
                }}
            />

            <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
                <div className="space-y-5">
                    {/* ─── Salary ─── */}
                    <Card>
                        <CardHead icon={Wallet} title="Monthly in-hand" subtitle="After tax and EPF — what actually reaches the bank" />
                        <CardBody>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 num text-lo text-[15px]">₹</span>
                                <input
                                    type="number"
                                    value={salary}
                                    onChange={(e) => setLocalSalary(Math.max(0, Number(e.target.value)))}
                                    className="field num !text-lg !font-semibold !py-3.5 !pl-9"
                                    aria-label="Monthly in-hand salary"
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-px mt-4 rounded-[var(--r-md)] overflow-hidden"
                                style={{ background: 'var(--line-subtle)' }}>
                                {[
                                    { l: 'Committed', v: money(committed), t: 'var(--loss)', n: 'rent, EMIs, essentials' },
                                    { l: 'Free', v: money(maxInvestable), t: 'var(--gain)', n: 'yours to route' },
                                    { l: 'Employer EPF', v: money(profile.income.epfEmployer), t: 'var(--text-lo)', n: 'invisible but real' },
                                ].map((s) => (
                                    <div key={s.l} className="p-3" style={{ background: 'var(--surface-1)' }}>
                                        <p className="label mb-1">{s.l}</p>
                                        <p className="num text-[15px] font-semibold" style={{ color: s.t }}>{s.v}</p>
                                        <p className="text-[10px] text-faint mt-0.5">{s.n}</p>
                                    </div>
                                ))}
                            </div>
                        </CardBody>
                    </Card>

                    {/* ─── Mode ─── */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <Segmented<'auto' | 'manual'>
                            value={mode}
                            onChange={setMode}
                            options={[
                                { value: 'auto', label: 'Recommended', icon: Sparkles },
                                { value: 'manual', label: 'Manual', icon: SlidersHorizontal },
                            ]}
                        />
                        {overCommitted && (
                            <Badge tone="loss" icon={Info}>
                                Exceeds what is actually free
                            </Badge>
                        )}
                    </div>

                    {/* ─── Rate ─── */}
                    {mode === 'auto' ? (
                        <Card>
                            <CardHead icon={Shield} title="Choose a pace" subtitle="This sets how much of each salary is swept out on payday" />
                            <CardBody className="grid sm:grid-cols-3 gap-3">
                                {(Object.keys(PRESETS) as RiskType[]).map((k) => {
                                    const p = PRESETS[k];
                                    const active = risk === k;
                                    return (
                                        <button
                                            key={k}
                                            onClick={() => setRisk(k)}
                                            className="text-left p-4 rounded-[var(--r-md)] transition-all duration-200"
                                            style={{
                                                background: active ? 'var(--surface-2)' : 'var(--surface-3)',
                                                border: `1px solid ${active ? p.color : 'var(--line-subtle)'}`,
                                            }}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[13px] font-semibold text-hi">{p.label}</span>
                                                {active && (
                                                    <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                                                )}
                                            </div>
                                            <p className="num text-xl font-semibold" style={{ color: p.color }}>
                                                {p.investPct}%
                                            </p>
                                            <p className="num text-[11px] text-faint mt-0.5">
                                                {money(Math.round((salary * p.investPct) / 100))}/mo
                                            </p>
                                            <p className="text-[11px] text-lo mt-2 leading-snug">{p.blurb}</p>
                                        </button>
                                    );
                                })}
                            </CardBody>
                        </Card>
                    ) : (
                        <Card>
                            <CardHead icon={SlidersHorizontal} title="Set it yourself" subtitle="Capped at what is genuinely uncommitted" />
                            <CardBody>
                                <div className="flex items-baseline justify-between mb-3">
                                    <span className="text-[13px] text-lo">Invested each payday</span>
                                    <div className="text-right">
                                        <span className="num text-2xl font-semibold text-hi">{investPct}%</span>
                                        <span className="num text-[13px] text-lo ml-2">
                                            {money(investAmount)}
                                        </span>
                                    </div>
                                </div>

                                <input
                                    type="range"
                                    min={0}
                                    max={60}
                                    value={investPct}
                                    onChange={(e) =>
                                        setSplit({ ...split, investments: Number(e.target.value) })
                                    }
                                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                                    style={{
                                        accentColor: overCommitted ? 'var(--loss)' : 'var(--accent)',
                                        background: 'var(--surface-3)',
                                    }}
                                    aria-label="Percentage of salary invested"
                                />

                                <div className="flex justify-between mt-2">
                                    <span className="text-[10.5px] text-faint">0%</span>
                                    <span className="text-[10.5px] text-faint">
                                        {maxPct}% is all that is actually free
                                    </span>
                                    <span className="text-[10.5px] text-faint">60%</span>
                                </div>

                                {overCommitted && (
                                    <div
                                        className="mt-4 p-3 rounded-[var(--r-md)] flex items-start gap-2.5"
                                        style={{ background: 'var(--loss-dim)', border: '1px solid rgba(255,77,109,0.22)' }}
                                    >
                                        <Info size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--loss)' }} />
                                        <p className="text-[12px] text-mid leading-relaxed">
                                            At {investPct}% you would be routing{' '}
                                            <span className="num font-semibold">{money(investAmount - maxInvestable)}</span>{' '}
                                            more than is left after your committed spending. In practice that
                                            means the shortfall lands on a credit card at 42%, which costs more
                                            than the investment earns.
                                        </p>
                                    </div>
                                )}
                            </CardBody>
                        </Card>
                    )}

                    {/* ─── Where it goes ─── */}
                    <Card>
                        <CardHead
                            icon={TrendingUp}
                            title="Where the invested rupee goes"
                            subtitle={bufferFirst ? 'Buffer-first, because your runway is below target' : 'Growth-first, your buffer is already safe'}
                            accent={bufferFirst ? 'var(--warn)' : 'var(--accent)'}
                        />
                        <CardBody>
                            <StackedMeter
                                segments={destinations.map((d) => ({
                                    label: d.label,
                                    value: d.pct,
                                    color: d.color,
                                }))}
                                height={11}
                                className="mb-4"
                            />
                            <div className="space-y-2.5">
                                {destinations.map((d) => (
                                    <div key={d.label} className="flex items-center gap-2.5">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                                        <span className="text-[12.5px] text-hi flex-1 min-w-0 truncate">{d.label}</span>
                                        <span className="text-[11px] text-faint shrink-0">{d.note}</span>
                                        <span className="num text-[12.5px] font-semibold text-hi shrink-0 w-20 text-right">
                                            {money(Math.round((investAmount * d.pct) / 100))}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {bufferFirst && (
                                <div
                                    className="mt-4 p-3.5 rounded-[var(--r-md)] flex items-start gap-2.5"
                                    style={{ background: 'var(--warn-dim)', border: '1px solid rgba(255,176,32,0.2)' }}
                                >
                                    <Lock size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--warn)' }} />
                                    <p className="text-[12px] text-mid leading-relaxed">
                                        Your runway is {runway.months.toFixed(1)} months against a{' '}
                                        {runway.target.toFixed(0)}-month target, so most of this goes somewhere
                                        you can actually reach. Once the buffer is full this flips to
                                        growth-first automatically.
                                    </p>
                                </div>
                            )}
                        </CardBody>
                    </Card>
                </div>

                {/* ─── Sticky summary ─── */}
                <div className="lg:sticky lg:top-4 space-y-4">
                    <Card>
                        <CardHead icon={CalendarClock} title="Next payday" subtitle={`${money(salary)} lands ${relativeDays(payday.daysToPayday)}`} accent="var(--info)" />
                        <CardBody>
                            <StackedMeter
                                segments={payday.slices.map((s) => ({
                                    label: s.label,
                                    value: s.amount,
                                    color: s.color,
                                }))}
                                height={11}
                                className="mb-4"
                            />
                            <div className="space-y-2">
                                {payday.slices.map((s) => (
                                    <div key={s.label} className="flex items-center gap-2.5">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                                        <span className="text-[12px] text-lo flex-1">{s.label}</span>
                                        <span className="num text-[12px] font-semibold text-hi">
                                            {money(s.amount)}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div
                                className="mt-4 pt-4 space-y-2"
                                style={{ borderTop: '1px solid var(--line-subtle)' }}
                            >
                                <Row label="Savings rate" value={share(score.savingsRate * 100)} />
                                <Row label="Runway after this" value={`${runway.months.toFixed(1)} mo`} />
                                <Row
                                    label="Freedom at"
                                    value={score.yearsToFreedom >= 70 ? '—' : `age ${Math.round(score.freedomAge)}`}
                                />
                            </div>

                            <button
                                onClick={apply}
                                disabled={overCommitted}
                                className="btn btn-primary w-full mt-5"
                            >
                                Approve routing <ArrowRight size={15} />
                            </button>
                            <p className="text-[10.5px] text-faint text-center mt-2">
                                Runs through Triple Guard before anything executes
                            </p>
                        </CardBody>
                    </Card>
                </div>
            </div>
        </>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-baseline">
            <span className="text-[12px] text-lo">{label}</span>
            <span className="num text-[12.5px] font-semibold text-hi">{value}</span>
        </div>
    );
}
