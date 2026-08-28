import { useState } from 'react';
import {
    Calendar, Target, Shield, TrendingUp, Landmark, Leaf, Bitcoin,
    IndianRupee, Check, ArrowRight, X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { useFinancials } from '../hooks/useFinancials';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { Stat } from '../components/primitives/Stat';
import { StackedMeter } from '../components/primitives/Meter';
import { PremiumGate } from '../components/PremiumGate';
import { money, moneyShort, share } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   Quarterly Pulse.

   Two fixes here.

   1. This page had NO premium check at all — not in the route, not in
      the page. The sidebar showed a crown next to it and the page
      opened for everyone, which also made cancelling a subscription
      look like it had done nothing.

   2. The layout was a single `max-w-4xl` column with the section
      spacing accidentally dropped, so on a desktop it read as a
      cramped mobile view. Now a real two-column desktop layout that
      uses the width it is given.
   ═══════════════════════════════════════════════════════════════════ */

const ALLOCATIONS = [
    { label: 'ELSS Mutual Funds', pct: 0.25, icon: Shield, clr: 'var(--series-1)', note: 'Sec 80C · ₹1.5L deduction · 3yr lock-in', saver: true },
    { label: 'Large Cap Equities', pct: 0.25, icon: TrendingUp, clr: 'var(--series-2)', note: 'LTCG above ₹1.25L taxed at 12.5%', saver: false },
    { label: 'PPF Contribution', pct: 0.15, icon: Landmark, clr: 'var(--series-3)', note: 'Sec 80C · tax-free returns · EEE status', saver: true },
    { label: 'ESG / Green Bonds', pct: 0.15, icon: Leaf, clr: 'var(--series-6)', note: 'Sec 54EC eligible · indexed gains', saver: true },
    { label: 'NPS Tier-I', pct: 0.10, icon: IndianRupee, clr: 'var(--series-4)', note: 'Sec 80CCD(1B) · extra ₹50k deduction', saver: true },
    { label: 'Crypto (BTC/ETH)', pct: 0.10, icon: Bitcoin, clr: 'var(--series-5)', note: 'Flat 30% · 1% TDS on transfer · no loss set-off', saver: false },
];

export default function QuarterlyPulse() {
    const { pulse, advancePulse } = useAppStore();
    const { profile, regimes } = useFinancials();
    const split = useAppStore((s) => s.split);

    const [showExecute, setShowExecute] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const monthlyInvestment = Math.round((profile.income.inHand * split.investments) / 100);
    const capital = pulse.stagedCapital;
    const ready = pulse.state === 'strike';

    /* ── Tax savings, capped at what this user can actually still claim ──
       A previous version summed every "saver" slice's percentage of
       capital and called the whole thing deductible, regardless of how
       much 80C or 80CCD(1B) room this specific person has left. Someone
       who already fills 80C through EPF elsewhere would have been shown
       a tax saving on money that earns them no deduction at all — the
       same kind of invented number this app has spent a lot of effort
       removing everywhere else. This uses the real headroom collected
       during onboarding instead of assuming the slice is always usable. */
    const c80 = profile.deductions.find((d) => d.section === '80C');
    const cNps = profile.deductions.find((d) => d.section === '80CCD1B');
    const headroom80C = c80 ? Math.max(0, c80.limit - c80.used) : 0;
    const headroomNps = cNps ? Math.max(0, cNps.limit - cNps.used) : 0;

    const elssPct = ALLOCATIONS.find((a) => a.label === 'ELSS Mutual Funds')!.pct;
    const ppfPct = ALLOCATIONS.find((a) => a.label === 'PPF Contribution')!.pct;
    const npsPct = ALLOCATIONS.find((a) => a.label === 'NPS Tier-I')!.pct;
    const esgPct = ALLOCATIONS.find((a) => a.label === 'ESG / Green Bonds')!.pct;

    // ELSS and PPF share the one 80C ceiling; NPS draws from the separate,
    // additional 80CCD(1B) ceiling. ESG/green bonds' Sec 54EC eligibility is
    // a different rule this app has no headroom data for, so that slice's
    // existing claim is left as-is.
    const proposed80C = capital * (elssPct + ppfPct);
    const proposedNps = capital * npsPct;
    const eligible80C = Math.min(proposed80C, headroom80C);
    const eligibleNps = Math.min(proposedNps, headroomNps);

    const headroomExceeded = eligible80C < proposed80C || eligibleNps < proposedNps;

    const taxSavable = eligible80C + eligibleNps + capital * esgPct;
    const estimatedTaxSaved = Math.round(taxSavable * regimes.old.marginal);

    const fire = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2600);
    };

    const advance = () => {
        advancePulse(monthlyInvestment);
        // Read the store fresh rather than computing from the pre-update
        // `pulse` this closure captured — with the engine now able to flip
        // straight to "ready" on the third click, a message derived from
        // the stale value could describe a state that already changed.
        const updated = useAppStore.getState().pulse;
        fire(
            updated.state === 'strike'
                ? `All 3 months staged — ${money(updated.stagedCapital)} ready to deploy`
                : `Month ${updated.currentMonth} of 3 staged ✓`
        );
    };

    return (
        <PremiumGate
            title="Quarterly Pulse"
            pitch="Stage capital for two months, deploy once — fewer transactions, fewer emotional entries, and a tax-aware allocation at the end."
            bullets={[
                'Capital accumulates in a low-risk staging pool',
                'One bulk deployment instead of twelve nervous ones',
                'Allocation weighted toward instruments that cut your tax bill',
            ]}
        >
            <PageHeader
                eyebrow="3-month strategy"
                title="Quarterly Pulse"
                description="Fewer, larger, better-timed decisions. Frequency is where most retail investors lose money."
                metric={{
                    label: 'Staged capital',
                    value: money(capital),
                    delta: `month ${pulse.currentMonth} of 3`,
                    up: true,
                }}
            />

            <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat
                        label="Status"
                        value={ready ? 'Ready' : 'Staging'}
                        hint={ready ? 'deploy now' : 'accumulating'}
                        tone={ready ? 'accent' : 'info'}
                        icon={Calendar}
                    />
                    <Stat label="Progress" value={`${pulse.currentMonth} / 3`} hint="months staged" icon={Target} />
                    <Stat label="Per month" value={money(monthlyInvestment)} hint={`${share(split.investments)} of in-hand`} icon={TrendingUp} />
                    <Stat
                        label="Tax saved on deploy"
                        value={money(estimatedTaxSaved)}
                        hint="at your marginal rate"
                        tone="gain"
                        icon={Shield}
                    />
                </div>

                <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
                    {/* ─── Timeline ─── */}
                    <div className="space-y-4">
                        <Card>
                            <CardHead icon={Calendar} title="The quarter" subtitle="Two months in, one month out" accent="var(--info)" />
                            <CardBody>
                                <div className="grid grid-cols-3 gap-2.5">
                                    {[1, 2, 3].map((m) => {
                                        const reached = pulse.currentMonth >= m;
                                        return (
                                            <div
                                                key={m}
                                                className="p-3.5 rounded-[var(--r-md)] text-center transition-all duration-300"
                                                style={{
                                                    background: reached ? 'var(--gain-dim)' : 'var(--surface-3)',
                                                    border: `1px solid ${reached ? 'rgba(0,232,134,0.25)' : 'var(--line-subtle)'}`,
                                                }}
                                            >
                                                <div
                                                    className="w-7 h-7 rounded-full grid place-items-center mx-auto mb-2"
                                                    style={{
                                                        background: reached ? 'var(--accent)' : 'var(--surface-2)',
                                                        color: reached ? 'var(--accent-ink)' : 'var(--text-faint)',
                                                    }}
                                                >
                                                    {reached ? <Check size={14} strokeWidth={3} /> : <span className="num text-[12px] font-bold">{m}</span>}
                                                </div>
                                                <p className={`text-[12.5px] font-semibold ${reached ? 'text-hi' : 'text-faint'}`}>
                                                    Month {m}
                                                </p>
                                                <p className="text-[10.5px] text-faint mt-0.5">
                                                    {m < 3 ? 'Accumulate' : 'Deploy'}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="well p-3.5 mt-4 space-y-2">
                                    <Row label="Staged so far" value={money(capital)} strong />
                                    <Row label="Adds each month" value={money(monthlyInvestment)} />
                                    <Row label="Projected at deploy" value={money(monthlyInvestment * 3)} />
                                </div>

                                {ready ? (
                                    <button onClick={() => setShowExecute(true)} className="btn w-full mt-4" style={{ background: 'var(--warn)', color: 'var(--accent-ink)' }}>
                                        Deploy {money(capital)} <ArrowRight size={15} />
                                    </button>
                                ) : (
                                    <button onClick={advance} className="btn btn-primary w-full mt-4">
                                        Stage month {pulse.currentMonth + 1} <ArrowRight size={15} />
                                    </button>
                                )}
                            </CardBody>
                        </Card>

                        <Card>
                            <CardHead icon={Target} title="Why staging beats drip-feeding" accent="var(--series-3)" />
                            <CardBody className="space-y-3">
                                {[
                                    ['Fewer decisions', 'Four deployments a year instead of twelve. Each one is a chance to act on a feeling rather than a plan.'],
                                    ['Lower friction', 'Fewer transactions means less brokerage, fewer exit loads, and a far simpler capital-gains statement in March.'],
                                    ['Tax-aware sizing', 'A quarterly lump can be sized against your remaining 80C and 80CCD headroom. A monthly SIP cannot.'],
                                ].map(([h, b], i) => (
                                    <div key={h} className="flex items-start gap-3">
                                        <span className="num text-[11px] font-bold shrink-0 mt-0.5 w-5 text-faint">
                                            0{i + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-[12.5px] font-semibold text-hi">{h}</p>
                                            <p className="text-[11.5px] text-lo leading-relaxed mt-0.5">{b}</p>
                                        </div>
                                    </div>
                                ))}
                            </CardBody>
                        </Card>

                        <Card>
                            <CardHead
                                icon={Shield}
                                title='"Why not just buy the shares myself?"'
                                subtitle="The honest answer, not a sales pitch"
                                accent="var(--info)"
                            />
                            <CardBody className="space-y-3">
                                <p className="text-[11.5px] text-lo leading-relaxed">
                                    This feature does <span className="text-hi font-semibold">not</span>{' '}
                                    claim to earn you more than investing the same money yourself, today,
                                    in one go. Historically a lump sum invested immediately beats spreading
                                    it out more often than not, because markets rise more years than they
                                    fall. Anyone telling you otherwise is selling something.
                                </p>
                                <p className="text-[11.5px] text-lo leading-relaxed">
                                    What this actually changes:
                                </p>
                                {[
                                    ['You skip the allocation decision', 'Six instruments, weighted, is a research task. Most people either never do it or do it once and never revisit it.'],
                                    ['Sizing matches your real deduction room', 'The ELSS, PPF and NPS slices are capped at what you told us you have left under 80C and 80CCD(1B) — not a guess.'],
                                    ['Fewer chances to panic', 'One decision every three months beats twelve. The damage in most portfolios comes from selling low in a bad week, not from the strategy itself.'],
                                ].map(([h, b]) => (
                                    <div key={h} className="flex items-start gap-2.5">
                                        <Check size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
                                        <div className="min-w-0">
                                            <p className="text-[12px] font-semibold text-hi">{h}</p>
                                            <p className="text-[11px] text-faint leading-relaxed mt-0.5">{b}</p>
                                        </div>
                                    </div>
                                ))}
                                <p className="text-[10.5px] text-faint pt-1">
                                    Right now every path in this app — here and on Invest — puts money into
                                    a diversified plan you approve, never a single company. That is a
                                    deliberate limit, not an oversight: see the note on Invest for why.
                                </p>
                            </CardBody>
                        </Card>
                    </div>

                    {/* ─── Planned allocation ─── */}
                    <Card>
                        <CardHead
                            icon={TrendingUp}
                            title="Where it will go"
                            subtitle="Weighted toward instruments that cut your tax bill"
                            accent="var(--accent)"
                            action={<Badge tone="gain">4 of 6 tax-saving</Badge>}
                        />
                        <CardBody>
                            <StackedMeter
                                segments={ALLOCATIONS.map((a) => ({ label: a.label, value: a.pct, color: a.clr }))}
                                height={10}
                                className="mb-4"
                            />

                            <div className="space-y-2.5">
                                {ALLOCATIONS.map((a) => (
                                    <div key={a.label} className="flex items-start gap-3 min-w-0">
                                        <a.icon size={15} className="mt-0.5 shrink-0" style={{ color: a.clr }} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <span className="text-[12.5px] font-medium text-hi truncate">{a.label}</span>
                                                <span className="num text-[12.5px] font-semibold text-hi shrink-0">
                                                    {capital > 0 ? moneyShort(capital * a.pct) : share(a.pct * 100)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                {a.saver && <Badge tone="gain">Tax saver</Badge>}
                                                <span className="text-[10.5px] text-faint">{a.note}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {capital > 0 && (
                                <div
                                    className="mt-4 p-3.5 rounded-[var(--r-md)] flex items-center justify-between gap-3"
                                    style={{ background: 'var(--gain-dim)', border: '1px solid rgba(0,232,134,0.2)' }}
                                >
                                    <div className="min-w-0">
                                        <p className="label mb-0.5">Estimated tax saved</p>
                                        <p className="text-[11px] text-lo">
                                            Sec 80C, 80CCD at {share(regimes.old.marginal * 100, 1)} marginal
                                        </p>
                                    </div>
                                    <p className="num text-xl font-semibold shrink-0" style={{ color: 'var(--gain)' }}>
                                        {money(estimatedTaxSaved)}
                                    </p>
                                </div>
                            )}

                            {capital > 0 && headroomExceeded && (
                                <p className="text-[11px] text-faint mt-2.5 leading-relaxed">
                                    Some of this quarter's ELSS, PPF or NPS money goes past what you have
                                    left under 80C / 80CCD(1B) — from what you told us during setup, that
                                    portion earns no further deduction. It still gets invested; the figure
                                    above only counts the part that genuinely reduces your tax.
                                </p>
                            )}
                        </CardBody>
                    </Card>
                </div>
            </div>

            {/* ─── Deploy confirmation ─── */}
            <AnimatePresence>
                {showExecute && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={() => setShowExecute(false)}
                        className="fixed inset-0 z-[100] grid place-items-center p-4"
                        style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
                        role="dialog" aria-modal="true"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: 8 }}
                            transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
                            onClick={(e) => e.stopPropagation()}
                            className="surface-raised w-full max-w-lg overflow-hidden"
                        >
                            <div className="p-5 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                                <div>
                                    <h2 className="text-[16px] font-bold text-hi">Deploy staged capital</h2>
                                    <p className="text-[12px] text-lo mt-0.5">
                                        {money(capital)} across six instruments
                                    </p>
                                </div>
                                <button onClick={() => setShowExecute(false)} className="btn btn-ghost !p-1.5" aria-label="Close">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="p-5 max-h-[46vh] overflow-y-auto space-y-2">
                                {ALLOCATIONS.map((a) => (
                                    <div key={a.label} className="well p-3 flex items-start gap-3 min-w-0">
                                        <a.icon size={15} className="mt-0.5 shrink-0" style={{ color: a.clr }} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <span className="text-[12.5px] font-semibold text-hi truncate">{a.label}</span>
                                                <span className="num text-[12.5px] font-bold text-hi shrink-0">
                                                    {money(capital * a.pct)}
                                                </span>
                                            </div>
                                            <p className="text-[10.5px] text-faint mt-0.5">{a.note}</p>
                                        </div>
                                        <span className="num text-[11px] text-faint shrink-0">{share(a.pct * 100)}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="px-5 pb-5 flex gap-2.5" style={{ borderTop: '1px solid var(--line-subtle)', paddingTop: 20 }}>
                                <button onClick={() => setShowExecute(false)} className="btn btn-secondary flex-1">
                                    Not yet
                                </button>
                                <button
                                    onClick={() => { setShowExecute(false); fire('Capital deployed'); }}
                                    className="btn btn-primary flex-1"
                                >
                                    Confirm deployment
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                        className="fixed bottom-6 right-6 px-5 py-3.5 rounded-[var(--r-md)] text-[13px] font-semibold z-[110]"
                        style={{ background: 'var(--accent)', color: 'var(--accent-ink)', boxShadow: 'var(--shadow-3)' }}
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>
        </PremiumGate>
    );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className="flex justify-between items-baseline gap-3">
            <span className="text-[12px] text-lo truncate">{label}</span>
            <span className={`num text-[12.5px] shrink-0 ${strong ? 'font-semibold text-hi' : 'text-mid'}`}>
                {value}
            </span>
        </div>
    );
}
