import { useId } from 'react';
import type { FreedomScore as Score } from '../../engine/runwayEngine';
import { money, share } from '../../lib/format';
import { useAnimatedValue } from '../../hooks/useAnimatedValue';
import { Card, CardHead, CardBody } from '../primitives/Card';
import { Compass } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   Freedom Score.

   A single 0-100 number is only trustworthy if you can see how it was
   built, so the five pillars are always visible next to it with a
   plain-English verdict each. No "your score is 31, upgrade to find
   out why" — that pattern is why people distrust these apps.

   The ring is a stroke-dasharray arc rather than a chart library
   donut: exact control over cap shape and a fraction of the weight.
   ═══════════════════════════════════════════════════════════════════ */

const PILLAR_TONE = {
    bad: 'var(--loss)',
    weak: 'var(--warn)',
    ok: 'var(--info)',
    good: 'var(--gain)',
} as const;

export function FreedomScore({ score }: { score: Score }) {
    const id = useId();
    const shown = useAnimatedValue(score.total, 1100);

    const R = 62;
    const C = 2 * Math.PI * R;
    const filled = (shown / 100) * C;

    const band =
        score.total < 30 ? 'Fragile'
            : score.total < 50 ? 'Stabilising'
                : score.total < 70 ? 'On track'
                    : score.total < 85 ? 'Strong'
                        : 'Free';

    const bandColor =
        score.total < 30 ? 'var(--loss)'
            : score.total < 50 ? 'var(--warn)'
                : score.total < 70 ? 'var(--info)'
                    : 'var(--gain)';

    return (
        <Card>
            <CardHead
                icon={Compass}
                title="Freedom Score"
                subtitle="How close work is to becoming optional"
                accent="var(--accent)"
            />
            <CardBody className="grid md:grid-cols-[168px_1fr] gap-6 items-start">
                {/* ─── The ring ─── */}
                <div className="flex flex-col items-center">
                    <div className="relative w-[152px] h-[152px]">
                        <svg viewBox="0 0 152 152" className="w-full h-full -rotate-90">
                            <circle
                                cx="76" cy="76" r={R}
                                fill="none"
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth="9"
                            />
                            <defs>
                                <linearGradient id={`fs-${id}`} x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor={bandColor} stopOpacity="0.6" />
                                    <stop offset="100%" stopColor={bandColor} />
                                </linearGradient>
                            </defs>
                            <circle
                                cx="76" cy="76" r={R}
                                fill="none"
                                stroke={`url(#fs-${id})`}
                                strokeWidth="9"
                                strokeLinecap="round"
                                strokeDasharray={`${filled} ${C}`}
                            />
                        </svg>

                        <div className="absolute inset-0 grid place-items-center">
                            <div className="text-center">
                                <p className="num text-[38px] font-semibold leading-none text-hi">
                                    {Math.round(shown)}
                                </p>
                                <p className="text-[10.5px] text-faint mt-0.5">out of 100</p>
                            </div>
                        </div>
                    </div>

                    <p
                        className="mt-2 text-[13px] font-semibold"
                        style={{ color: bandColor }}
                    >
                        {band}
                    </p>
                </div>

                {/* ─── The pillars ─── */}
                <div className="min-w-0">
                    <div className="space-y-3.5">
                        {score.pillars.map((p) => {
                            const tone = PILLAR_TONE[p.state];
                            const pct = (p.score / p.max) * 100;
                            return (
                                <div key={p.key}>
                                    <div className="flex items-baseline justify-between gap-3 mb-1">
                                        <span className="text-[12.5px] font-medium text-hi">{p.label}</span>
                                        <span className="num text-[11.5px] text-lo shrink-0">
                                            {p.score.toFixed(0)}<span className="text-faint">/{p.max}</span>
                                        </span>
                                    </div>
                                    <div
                                        className="h-1.5 rounded-full overflow-hidden mb-1.5"
                                        style={{ background: 'rgba(255,255,255,0.06)' }}
                                    >
                                        <div
                                            className="h-full rounded-full transition-[width] duration-700 ease-smooth"
                                            style={{ width: `${pct}%`, background: tone }}
                                        />
                                    </div>
                                    <p className="text-[11.5px] text-lo leading-snug">{p.verdict}</p>
                                </div>
                            );
                        })}
                    </div>

                    {/* ─── The horizon ─── */}
                    <div
                        className="mt-5 pt-4 grid grid-cols-3 gap-4"
                        style={{ borderTop: '1px solid var(--line-subtle)' }}
                    >
                        <div>
                            <p className="label mb-1">Net worth</p>
                            <p className="num text-[15px] font-semibold text-hi">
                                {money(score.netWorth)}
                            </p>
                        </div>
                        <div>
                            <p className="label mb-1">Freedom at</p>
                            <p className="num text-[15px] font-semibold text-hi">
                                {score.yearsToFreedom >= 70 ? '—' : `age ${Math.round(score.freedomAge)}`}
                            </p>
                            <p className="text-[10.5px] text-faint mt-0.5">
                                {score.yearsToFreedom >= 70
                                    ? 'not on this trajectory'
                                    : `in ${score.yearsToFreedom.toFixed(0)} years`}
                            </p>
                        </div>
                        <div>
                            <p className="label mb-1">Corpus needed</p>
                            <p className="num text-[15px] font-semibold text-hi">
                                {money(score.fiNumber)}
                            </p>
                            <p className="text-[10.5px] text-faint mt-0.5">
                                {share(score.fiProgress * 100, 1)} there
                            </p>
                        </div>
                    </div>
                </div>
            </CardBody>
        </Card>
    );
}
