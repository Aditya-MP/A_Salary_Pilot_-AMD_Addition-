import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Bot, Sparkles, RefreshCw, ChevronDown, AlertTriangle,
    AlertCircle, Lightbulb, CircleCheck, Cpu,
} from 'lucide-react';
import { useFinancials } from '../hooks/useFinancials';
import { runAgents, type Agent, type Severity } from '../engine/agents';
import { getCoachAdvice } from '../lib/coach';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { Stat } from '../components/primitives/Stat';
import { Stagger, Item } from '../components/motion/Reveal';
import { PremiumGate } from '../components/PremiumGate';
import { money, share } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   AI Coach.

   You asked whether these agents were actually earning their place.
   The short answer is that three of the four were, and one was not —
   the reasoning is written out in src/engine/agents.ts. The bigger
   problem was that none of them computed anything: each agent held a
   fixed array of three strings that would be identical for every user
   on the platform.

   Every finding on this page is now derived from the user's own
   numbers, and each one shows its reasoning so the advice can be
   argued with rather than just believed.
   ═══════════════════════════════════════════════════════════════════ */

const SEV: Record<Severity, { color: string; icon: React.ElementType; label: string }> = {
    urgent: { color: 'var(--loss)', icon: AlertTriangle, label: 'Act now' },
    attention: { color: 'var(--warn)', icon: AlertCircle, label: 'Needs attention' },
    opportunity: { color: 'var(--info)', icon: Lightbulb, label: 'Opportunity' },
    healthy: { color: 'var(--gain)', icon: CircleCheck, label: 'Healthy' },
};

export default function AICoach() {
    const fin = useFinancials();
    const [advice, setAdvice] = useState<string | null>(null);
    /** True when `advice` is an explanation of why there's no real answer,
        not an actual model response — so the UI doesn't caption a failure
        message as "generated from your live figures". */
    const [adviceFailed, setAdviceFailed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState<string | null>(null);

    const agents = useMemo(
        () =>
            runAgents({
                profile: fin.profile,
                runway: fin.runway,
                score: fin.score,
                portfolio: fin.portfolio,
                regimes: fin.regimes,
                headroom: fin.headroom,
                leaks: fin.leaks,
            }),
        [fin]
    );

    const all = agents.flatMap((a) => a.findings);
    const urgent = all.filter((f) => f.severity === 'urgent').length;
    const opportunities = all.filter((f) => f.severity === 'opportunity').length;

    // Total rupees identified across tax headroom, harvesting and leaks.
    const identified =
        fin.headroom.totalWorth + fin.portfolio.harvestSaving + fin.leaks.recoverableNow;

    const askGemini = async () => {
        setLoading(true);
        // Real context, so the model has something to work with rather
        // than the generic prompt the old version sent.
        const ctx = [
            `Age ${fin.profile.age}, ${fin.profile.dependents} dependents, ${fin.profile.risk} risk appetite.`,
            `In-hand ${money(fin.profile.income.inHand)}/month.`,
            `Runway ${fin.runway.months.toFixed(1)} months against a ${fin.runway.target} month target.`,
            `Freedom Score ${fin.score.total}/100, savings rate ${share(fin.score.savingsRate * 100)}.`,
            `Portfolio ${money(fin.portfolio.current)}, ${share(fin.portfolio.pnlPct, 1)} unrealised, concentration index ${fin.portfolio.concentration.toFixed(1)}.`,
            `Highest-rate debt: ${fin.profile.debts[0] ? `${share(fin.profile.debts[0].rate * 100)} on ${money(fin.profile.debts[0].balance)}` : 'none'}.`,
            `Unused tax deductions worth ${money(fin.headroom.totalWorth)}.`,
        ].join(' ');

        const res = await getCoachAdvice(ctx);
        if (res.ok) {
            setAdvice(res.data.advice);
            setAdviceFailed(false);
        } else {
            // The server tells the difference between "not configured" and
            // "reachable but failed" in its error text; either way, the six
            // agents below already computed real findings from these same
            // numbers with no external call at all, so this is a soft
            // failure, not a broken page.
            setAdvice(res.error || 'Could not reach the AI coach right now.');
            setAdviceFailed(true);
        }
        setLoading(false);
    };

    return (
        <PremiumGate
            title="AI Coach"
            pitch="Six agents that read your actual balance sheet and show their working."
            bullets={[
                'Every finding computed from your numbers, never a canned string',
                'Each one shows the reasoning, so you can disagree with it',
                'Ranked by urgency, from "act now" to "leave it alone"',
            ]}
        >
            <PageHeader
                eyebrow="Six agents"
                title="AI Coach"
                description="Each agent watches one part of your finances and reports what it found, with its reasoning."
                metric={{
                    label: 'Identified this year',
                    value: money(identified),
                    delta: `${all.length} findings`,
                    up: true,
                }}
                actions={
                    <button onClick={askGemini} disabled={loading} className="btn btn-secondary !text-[12.5px]">
                        {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        {loading ? 'Thinking…' : 'Ask Gemini'}
                    </button>
                }
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <Stat label="Act now" value={`${urgent}`} hint="urgent findings" tone={urgent ? 'loss' : 'gain'} icon={AlertTriangle} />
                <Stat label="Opportunities" value={`${opportunities}`} hint="money on the table" tone="info" icon={Lightbulb} />
                <Stat label="Recoverable" value={money(identified)} hint="tax, leaks, harvesting" tone="accent" icon={Sparkles} />
                <Stat label="Freedom Score" value={`${fin.score.total}`} hint="out of 100" icon={Bot} />
            </div>

            {/* ─── Live model insight ─── */}
            <AnimatePresence>
                {advice && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mb-5"
                    >
                        <Card>
                            <CardBody className="flex items-start gap-3.5">
                                <div
                                    className="w-9 h-9 rounded-[var(--r-md)] grid place-items-center shrink-0"
                                    style={{
                                        background: adviceFailed ? 'var(--warn-dim)' : 'var(--info-dim)',
                                        border: `1px solid ${adviceFailed ? 'rgba(255,176,32,0.25)' : 'rgba(56,189,248,0.25)'}`,
                                    }}
                                >
                                    <Sparkles size={17} style={{ color: adviceFailed ? 'var(--warn)' : 'var(--info)' }} />
                                </div>
                                <div className="min-w-0">
                                    <p className="label mb-1">{adviceFailed ? 'AI coach unavailable' : 'Live model insight'}</p>
                                    <p className="text-[13px] text-mid leading-relaxed">{advice}</p>
                                    {!adviceFailed && (
                                        <p className="text-[10.5px] text-faint mt-2">
                                            Generated from your live figures. Treat as a second opinion, not
                                            instruction — the agents below show their working, this does not.
                                        </p>
                                    )}
                                </div>
                            </CardBody>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── The agents ─── */}
            <Stagger className="space-y-3">
                {agents.map((a) => (
                    <Item key={a.id}>
                        <AgentCard
                            agent={a}
                            open={open === a.id}
                            onToggle={() => setOpen(open === a.id ? null : a.id)}
                        />
                    </Item>
                ))}
            </Stagger>

            {/* ─── What changed, and why ─── */}
            <Card className="mt-5">
                <CardHead
                    icon={Cpu}
                    title="Why these six"
                    subtitle="What changed from the previous agent line-up"
                />
                <CardBody className="space-y-3 text-[12.5px] leading-relaxed">
                    <p className="text-lo">
                        <span className="text-hi font-semibold">Kept and rewritten —</span>{' '}
                        Tax Expert, Risk Alert (now Portfolio Doctor) and Portfolio Planner
                        (now Milestone Planner). The ideas were right; the output was three
                        fixed sentences per agent, identical for every user. They compute now.
                    </p>
                    <p className="text-lo">
                        <span className="text-hi font-semibold">Cut —</span>{' '}
                        Market Rules Agent. Summarising SEBI circulars is news, not coaching,
                        and it belongs on the News page. An agent should tell you what to do
                        about your own money.
                    </p>
                    <p className="text-lo">
                        <span className="text-hi font-semibold">Added —</span>{' '}
                        Runway Guard, Debt Strategist and Leak Hunter. Nothing was watching
                        whether you could survive a job loss, nothing noticed a 42% credit card
                        while the app recommended more equity, and nothing looked at money
                        going out. These three turned out to matter more than any of the
                        originals.
                    </p>
                    <p className="text-faint pt-2" style={{ borderTop: '1px solid var(--line-subtle)' }}>
                        Also removed: the fixed "18-22% CAGR" projection. Asserting a return
                        with no basis is the fastest way to lose a user's trust, and in India
                        it would not survive SEBI scrutiny either.
                    </p>
                </CardBody>
            </Card>
        </PremiumGate>
    );
}

/* ═══════════════════ Agent card ═══════════════════ */

function AgentCard({
    agent,
    open,
    onToggle,
}: {
    agent: Agent;
    open: boolean;
    onToggle: () => void;
}) {
    const sev = SEV[agent.severity];
    const SevIcon = sev.icon;

    return (
        <Card>
            <button
                onClick={onToggle}
                className="w-full text-left p-4 flex items-start gap-3.5 transition-colors hover:bg-[var(--surface-2)]"
                aria-expanded={open}
            >
                <div
                    className="w-9 h-9 rounded-[var(--r-md)] grid place-items-center shrink-0"
                    style={{ background: `color-mix(in srgb, ${agent.color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${agent.color} 30%, transparent)` }}
                >
                    <Bot size={17} style={{ color: agent.color }} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <p className="text-[14px] font-semibold text-hi">{agent.name}</p>
                            <Badge
                                tone={
                                    agent.severity === 'urgent' ? 'loss'
                                        : agent.severity === 'attention' ? 'warn'
                                            : agent.severity === 'opportunity' ? 'info'
                                                : 'gain'
                                }
                                icon={SevIcon}
                            >
                                {sev.label}
                            </Badge>
                        </div>
                        <ChevronDown
                            size={16}
                            className="text-faint shrink-0 transition-transform duration-200"
                            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                        />
                    </div>

                    <p className="text-[12px] text-faint mt-0.5">{agent.role}</p>
                    <p className="text-[12.5px] text-hi font-medium mt-2">{agent.verdict}</p>
                    <p className="text-[11px] text-faint mt-1.5">
                        {agent.findings.length} finding{agent.findings.length > 1 ? 's' : ''} · watching {agent.watches.toLowerCase()}
                    </p>
                </div>
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                        className="overflow-hidden"
                    >
                        <div style={{ borderTop: '1px solid var(--line-subtle)' }}>
                            {agent.findings.map((f, i) => {
                                const s = SEV[f.severity];
                                const Icon = s.icon;
                                return (
                                    <div
                                        key={f.id}
                                        className="p-4"
                                        style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-subtle)' }}
                                    >
                                        <div className="flex items-start justify-between gap-4 flex-wrap">
                                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                                <Icon size={14} className="mt-0.5 shrink-0" style={{ color: s.color }} />
                                                <p className="text-[13.5px] font-semibold text-hi">{f.headline}</p>
                                            </div>

                                            {f.figure && (
                                                <div className="text-right shrink-0">
                                                    <p className="num text-[17px] font-semibold" style={{ color: s.color }}>
                                                        {f.figure}
                                                    </p>
                                                    <p className="text-[10px] text-faint">{f.figureLabel}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Reasoning shown, not hidden. */}
                                        <div className="mt-3 pl-6">
                                            <p className="label mb-1">Because</p>
                                            <p className="text-[12.5px] text-lo leading-relaxed">{f.because}</p>

                                            <div
                                                className="mt-3 p-3 rounded-[var(--r-sm)]"
                                                style={{ background: 'var(--surface-3)' }}
                                            >
                                                <p className="label mb-1" style={{ color: 'var(--accent)' }}>Do this</p>
                                                <p className="text-[12.5px] text-mid leading-relaxed">{f.action}</p>
                                            </div>

                                            <div className="flex items-center gap-2 mt-2.5">
                                                <div
                                                    className="h-1 w-16 rounded-full overflow-hidden"
                                                    style={{ background: 'rgba(255,255,255,0.08)' }}
                                                >
                                                    <div
                                                        className="h-full rounded-full"
                                                        style={{ width: `${f.confidence * 100}%`, background: s.color }}
                                                    />
                                                </div>
                                                <span className="text-[10.5px] text-faint">
                                                    {share(f.confidence * 100)} confidence
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}
