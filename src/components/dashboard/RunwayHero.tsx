import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import { ShieldAlert, ShieldCheck, Shield } from 'lucide-react';
import type { RunwayBreakdown } from '../../engine/runwayEngine';
import { money, moneyShort } from '../../lib/format';
import { AnimatedNumber } from '../motion/AnimatedNumber';
import { AXIS, GRID, TOOLTIP } from '../charts/chartTheme';

/* ═══════════════════════════════════════════════════════════════════
   Runway card.

   The chart deliberately slopes DOWN to zero. Every other chart in
   every finance app slopes up and to the right; this one is honest
   about depletion and labels the month the money runs out.

   Layout note: the two panels sit in a grid whose columns are both
   minmax(0,…). Without that, the Recharts container refuses to shrink
   below its intrinsic width and pushes the card wider than the page —
   which is exactly how dashboards end up bleeding past their
   background.
   ═══════════════════════════════════════════════════════════════════ */

const STATUS = {
    critical: { color: 'var(--loss)', icon: ShieldAlert, title: 'Critical' },
    thin: { color: 'var(--warn)', icon: ShieldAlert, title: 'Thin' },
    building: { color: 'var(--info)', icon: Shield, title: 'Building' },
    safe: { color: 'var(--gain)', icon: ShieldCheck, title: 'Safe' },
} as const;

export function RunwayHero({
    runway,
    projection,
}: {
    runway: RunwayBreakdown;
    projection: { month: string; balance: number; lean: number }[];
}) {
    const cfg = STATUS[runway.status];
    const Icon = cfg.icon;
    const progress = Math.min(100, (runway.months / runway.target) * 100);

    const dryLabel = runway.dryDate.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
    });

    const zeroIndex = projection.findIndex((p) => p.balance <= 0);

    return (
        <section className="surface grid lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] overflow-hidden">
            {/* ─── The number ─── */}
            <div
                className="p-5 min-w-0 border-b lg:border-b-0 lg:border-r"
                style={{ borderColor: 'var(--line-subtle)' }}
            >
                <div className="flex items-center gap-2 mb-3">
                    <Icon size={14} style={{ color: cfg.color }} aria-hidden />
                    <span className="label" style={{ color: cfg.color }}>
                        Runway · {cfg.title}
                    </span>
                </div>

                <div className="flex items-baseline gap-2 flex-wrap">
                    <AnimatedNumber
                        value={runway.months}
                        format={(v) => v.toFixed(1)}
                        className="num text-[46px] font-semibold leading-none tracking-tight text-hi"
                    />
                    <span className="text-[15px] text-lo font-medium">months</span>
                </div>

                <p className="text-[12.5px] text-lo mt-2.5 leading-relaxed">
                    Zero income from today covers you until{' '}
                    <span className="text-hi font-semibold">{dryLabel}</span>.
                </p>

                <div className="mt-4">
                    <div className="flex justify-between items-baseline mb-1.5 gap-2">
                        <span className="text-[11.5px] text-lo truncate">
                            Target {runway.target.toFixed(0)} months
                        </span>
                        <span className="num text-[11.5px] font-semibold text-hi shrink-0">
                            {progress.toFixed(0)}%
                        </span>
                    </div>
                    <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.06)' }}
                    >
                        <div
                            className="h-full rounded-full transition-[width] duration-[900ms] ease-smooth"
                            style={{ width: `${progress}%`, background: cfg.color }}
                        />
                    </div>
                    {runway.gap > 0 && (
                        <p className="text-[11.5px] text-faint mt-2 leading-snug">
                            <span className="num font-semibold" style={{ color: cfg.color }}>
                                {money(runway.gap)}
                            </span>{' '}
                            more reaches safe.
                        </p>
                    )}
                </div>

                {/* The inputs behind the headline. Showing them is what
                    makes the number believable rather than magical. */}
                <div
                    className="mt-4 pt-4 grid grid-cols-2 gap-x-3 gap-y-3"
                    style={{ borderTop: '1px solid var(--line-subtle)' }}
                >
                    {[
                        { l: 'Reachable now', v: moneyShort(runway.liquidToday), t: 'var(--text-hi)' },
                        { l: 'Essential burn', v: `${moneyShort(runway.essentialBurn)}/mo`, t: 'var(--text-hi)' },
                        { l: 'Could cut', v: `${moneyShort(runway.discretionaryBurn)}/mo`, t: 'var(--warn)' },
                        { l: 'Locked away', v: moneyShort(runway.locked), t: 'var(--text-faint)' },
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

            {/* ─── The depletion curve ─── */}
            <div className="p-5 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <p className="label">If income stopped today</p>
                    <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-lo">
                            <span className="w-2.5 h-0.5 rounded" style={{ background: cfg.color }} />
                            Current spending
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-faint">
                            <span className="w-2.5 h-0.5 rounded" style={{ background: 'var(--text-faint)' }} />
                            Essentials only
                        </span>
                    </div>
                </div>

                <div className="h-[214px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={projection} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <defs>
                                <linearGradient id="runwayFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={cfg.color} stopOpacity={0.26} />
                                    <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid {...GRID} />
                            <XAxis dataKey="month" {...AXIS} interval={1} />
                            <YAxis {...AXIS} width={44} tickFormatter={(v) => moneyShort(v)} />
                            <Tooltip
                                {...TOOLTIP}
                                formatter={((v: number | undefined, name: unknown) => [
                                    money(v ?? 0),
                                    name === 'balance' ? 'Current spending' : 'Essentials only',
                                ]) as never}
                            />
                            {zeroIndex > 0 && (
                                <ReferenceLine
                                    x={projection[zeroIndex].month}
                                    stroke="var(--loss)"
                                    strokeDasharray="3 3"
                                />
                            )}
                            <Area
                                type="monotone"
                                dataKey="lean"
                                stroke="var(--text-faint)"
                                strokeWidth={1.25}
                                strokeDasharray="3 3"
                                fill="none"
                            />
                            <Area
                                type="monotone"
                                dataKey="balance"
                                stroke={cfg.color}
                                strokeWidth={2}
                                fill="url(#runwayFill)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </section>
    );
}
