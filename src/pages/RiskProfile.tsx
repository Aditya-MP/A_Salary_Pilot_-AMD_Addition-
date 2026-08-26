import { useNavigate } from 'react-router-dom';
import { Shield, Check, ArrowRight, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useFinancials } from '../hooks/useFinancials';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { StackedMeter } from '../components/primitives/Meter';
import { TARGET_MIX } from '../engine/portfolioEngine';
import { share } from '../lib/format';
import type { RiskType } from '../domain/types';

/* This page previously used an entirely different palette from the rest
   of the app — indigo/blue/cyan gradients and Tailwind's emerald ring
   utilities, while every neighbouring screen was on the neon set. It
   was the clearest single example of the pages not looking related.

   It also asked about risk appetite in isolation. Risk tolerance is
   meaningless without runway: someone with three weeks of cover cannot
   afford an aggressive allocation no matter how they feel about
   volatility, so the page now says so. */

const PROFILES: {
    id: RiskType;
    title: string;
    desc: string;
    traits: string[];
    color: string;
}[] = [
        {
            id: 'conservative',
            title: 'Conservative',
            desc: 'Protect what you have. Growth is a bonus, not the plan.',
            traits: ['Low volatility', 'Debt-heavy', 'Sleeps well in a crash'],
            color: 'var(--info)',
        },
        {
            id: 'balanced',
            title: 'Balanced',
            desc: 'Growth you can actually hold through a bad year.',
            traits: ['Mixed allocation', 'Moderate swings', 'Diversified'],
            color: 'var(--accent)',
        },
        {
            id: 'aggressive',
            title: 'Aggressive',
            desc: 'Maximum long-run growth, and genuinely uncomfortable years.',
            traits: ['Equity-heavy', 'Deep drawdowns', 'Needs a long horizon'],
            color: 'var(--warn)',
        },
    ];

const CLASS_COLOR: Record<string, string> = {
    equity: 'var(--series-1)',
    debt: 'var(--series-2)',
    gold: 'var(--series-4)',
    crypto: 'var(--series-5)',
    esg: 'var(--series-6)',
    cash: 'var(--series-3)',
    retirement: '#7c8598',
};

export default function RiskProfile() {
    const navigate = useNavigate();
    const risk = useAppStore((s) => s.risk);
    const setRisk = useAppStore((s) => s.setRisk);
    const { runway } = useFinancials();

    // The honest caveat: allocation follows safety, not preference.
    const tooRiskyForNow = runway.months < 3;

    return (
        <>
            <PageHeader
                eyebrow="Profile"
                title="Risk Profile"
                description="How much volatility you can hold without selling at the wrong moment — which is the only definition that matters."
            />

            {tooRiskyForNow && (
                <Card className="mb-5">
                    <CardBody className="flex items-start gap-3">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--warn)' }} />
                        <div>
                            <p className="text-[13.5px] font-semibold text-hi">
                                Your runway is {runway.months.toFixed(1)} months
                            </p>
                            <p className="text-[12.5px] text-lo mt-1 leading-relaxed">
                                Risk appetite is a preference; runway is a constraint. With under three
                                months of cover, a job loss would force you to sell whatever you hold —
                                probably in a downturn, since layoffs and market falls arrive together.
                                Build the buffer first, then this choice is genuinely yours.
                            </p>
                        </div>
                    </CardBody>
                </Card>
            )}

            <div className="grid lg:grid-cols-3 gap-4 mb-5">
                {PROFILES.map((p) => {
                    const active = risk === p.id;
                    return (
                        <button
                            key={p.id}
                            onClick={() => setRisk(p.id)}
                            className="surface surface-interactive text-left p-5"
                            style={active ? { borderColor: p.color } : undefined}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div
                                    className="w-9 h-9 rounded-[var(--r-md)] grid place-items-center"
                                    style={{
                                        background: `color-mix(in srgb, ${p.color} 14%, transparent)`,
                                        border: `1px solid color-mix(in srgb, ${p.color} 30%, transparent)`,
                                    }}
                                >
                                    <Shield size={16} style={{ color: p.color }} />
                                </div>
                                {active && (
                                    <div
                                        className="w-5 h-5 rounded-full grid place-items-center"
                                        style={{ background: p.color }}
                                    >
                                        <Check size={12} strokeWidth={3} style={{ color: 'var(--accent-ink)' }} />
                                    </div>
                                )}
                            </div>

                            <h3 className="text-[15px] font-semibold text-hi">{p.title}</h3>
                            <p className="text-[12.5px] text-lo mt-1 leading-relaxed">{p.desc}</p>

                            <div className="flex flex-wrap gap-1.5 mt-3">
                                {p.traits.map((t) => (
                                    <Badge key={t} tone="muted">{t}</Badge>
                                ))}
                            </div>

                            {/* The allocation this choice implies, shown inline —
                                otherwise "aggressive" is just a word. */}
                            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--line-subtle)' }}>
                                <p className="label mb-2">Target mix</p>
                                <StackedMeter
                                    segments={Object.entries(TARGET_MIX[p.id])
                                        .filter(([, v]) => (v ?? 0) > 0)
                                        .map(([k, v]) => ({
                                            label: k,
                                            value: v ?? 0,
                                            color: CLASS_COLOR[k] ?? 'var(--text-faint)',
                                        }))}
                                    height={8}
                                />
                                <p className="num text-[11px] text-faint mt-2">
                                    {share(TARGET_MIX[p.id].equity ?? 0)} equity ·{' '}
                                    {share(TARGET_MIX[p.id].debt ?? 0)} debt
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>

            <Card>
                <CardHead title="What this actually changes" icon={Shield} />
                <CardBody className="space-y-2.5 text-[12.5px] text-lo leading-relaxed">
                    <p>
                        Your choice sets the target allocation the Portfolio page measures drift
                        against, and the pace Salary Routing recommends. It also feeds the real
                        return assumption behind your freedom date — 6% conservative, 7.5%
                        balanced, 9% aggressive, all after inflation.
                    </p>
                    <p className="text-faint">
                        It does not change what you already hold. Rebalancing toward a new target
                        is best done with new contributions rather than sales, so nothing triggers
                        capital gains tax.
                    </p>
                </CardBody>
            </Card>

            <button
                onClick={() => navigate('/dashboard/salary-splitting')}
                className="btn btn-primary w-full mt-5"
            >
                Continue to Salary Routing <ArrowRight size={15} />
            </button>
        </>
    );
}
