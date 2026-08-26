import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    GraduationCap, Check, Clock, Target, ChevronDown, Flame,
    CircleCheck, CircleX, Lightbulb, ArrowRight,
} from 'lucide-react';
import { useFinancials } from '../hooks/useFinancials';
import { useAppStore } from '../store/useAppStore';
import { LESSONS, TRACKS, prioritiseLessons, type Lesson, type TrackId } from '../domain/curriculum';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { Stat } from '../components/primitives/Stat';
import { Stagger, Item } from '../components/motion/Reveal';
import { PremiumGate } from '../components/PremiumGate';
import { share } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   Learning Hub.

   What was here: six invented module titles with fake progress bars, a
   chatbot that returned the same hardcoded paragraph regardless of the
   question, and three YouTube placeholder cards.

   What replaced it: fourteen real lessons with actual content, ordered
   by the user's weakest Freedom Score pillar rather than by difficulty.
   Somebody bleeding 42% on a credit card sees the debt lesson first,
   not "Introduction to Compound Interest".

   Each lesson names the specific mistake it prevents, ends in one
   concrete action, and carries a single check-for-understanding
   question — because reading a paragraph and knowing a thing are
   different, and finance apps consistently pretend otherwise.
   ═══════════════════════════════════════════════════════════════════ */

export default function Learning() {
    const { score } = useFinancials();
    const completed = useAppStore((s) => s.completedLessons);
    const toggleLesson = useAppStore((s) => s.toggleLesson);
    const streak = useAppStore((s) => s.lessonStreak);

    const [track, setTrack] = useState<TrackId | 'all'>('all');
    const [open, setOpen] = useState<string | null>(null);

    const ordered = useMemo(
        () => prioritiseLessons(LESSONS, score.pillars, completed),
        [score.pillars, completed]
    );

    const visible = track === 'all' ? ordered : ordered.filter((l) => l.track === track);

    const done = completed.length;
    const total = LESSONS.length;
    const minutesLeft = LESSONS.filter((l) => !completed.includes(l.id)).reduce(
        (s, l) => s + l.minutes,
        0
    );

    // The weakest pillar drives the "start here" banner.
    const weakest = [...score.pillars].sort((a, b) => a.score / a.max - b.score / b.max)[0];
    const recommended = ordered.find((l) => !completed.includes(l.id));

    return (
        <PremiumGate
            title="Learning Hub"
            pitch="Fourteen lessons that reorder themselves around whatever you are currently losing money on."
            bullets={[
                'Ordered by your weakest Freedom Score pillar, not by difficulty',
                'Every lesson names the exact mistake it prevents',
                'One concrete action and one comprehension check each',
            ]}
        >
            <PageHeader
                eyebrow="Education"
                title="Learning Hub"
                description="Ordered by what your numbers say you are getting wrong — not by beginner-to-advanced."
                metric={{
                    label: 'Completed',
                    value: `${done}/${total}`,
                    delta: `${share((done / total) * 100)} done`,
                    up: true,
                }}
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <Stat label="Lessons done" value={`${done}`} hint={`of ${total}`} icon={GraduationCap} tone="accent" />
                <Stat label="Reading left" value={`${minutesLeft} min`} hint="whole curriculum" icon={Clock} />
                <Stat label="Day streak" value={`${streak}`} hint="keep it alive" tone="warn" icon={Flame} />
                <Stat
                    label="Weakest area"
                    value={weakest.label}
                    hint={`${weakest.score.toFixed(0)}/${weakest.max}`}
                    tone="loss"
                    icon={Target}
                />
            </div>

            {/* ─── The personalisation, made explicit ─── */}
            {recommended && (
                <Card className="mb-5">
                    <CardBody className="flex items-start gap-4">
                        <div
                            className="w-9 h-9 rounded-[var(--r-md)] grid place-items-center shrink-0"
                            style={{ background: 'var(--gain-dim)', border: '1px solid rgba(0,232,134,0.22)' }}
                        >
                            <Lightbulb size={17} style={{ color: 'var(--accent)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="label mb-1">Start here</p>
                            <p className="text-[14px] font-semibold text-hi">{recommended.title}</p>
                            <p className="text-[12px] text-lo mt-1 leading-relaxed">
                                Your weakest pillar is <span className="text-hi font-medium">{weakest.label}</span>.{' '}
                                {weakest.verdict}
                            </p>
                            <button
                                onClick={() => setOpen(recommended.id)}
                                className="btn btn-primary !py-1.5 !px-3.5 !text-[12px] mt-3"
                            >
                                Read it — {recommended.minutes} min <ArrowRight size={13} />
                            </button>
                        </div>
                    </CardBody>
                </Card>
            )}

            {/* ─── Track filter ─── */}
            <div className="flex gap-2 mb-4 scroll-x no-bar pb-1">
                <button
                    onClick={() => setTrack('all')}
                    className="btn !py-1.5 !px-3 !text-[12px] shrink-0"
                    style={
                        track === 'all'
                            ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                            : { background: 'var(--surface-2)', color: 'var(--text-lo)', border: '1px solid var(--line)' }
                    }
                >
                    All {total}
                </button>
                {TRACKS.map((t) => {
                    const count = LESSONS.filter((l) => l.track === t.id).length;
                    const doneIn = LESSONS.filter((l) => l.track === t.id && completed.includes(l.id)).length;
                    const active = track === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTrack(t.id)}
                            className="btn !py-1.5 !px-3 !text-[12px] shrink-0"
                            style={
                                active
                                    ? { background: t.color, color: 'var(--accent-ink)' }
                                    : { background: 'var(--surface-2)', color: 'var(--text-lo)', border: '1px solid var(--line)' }
                            }
                        >
                            <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: active ? 'var(--accent-ink)' : t.color }}
                            />
                            {t.label} {doneIn}/{count}
                        </button>
                    );
                })}
            </div>

            {/* ─── Lessons ─── */}
            <Stagger className="space-y-2.5">
                {visible.map((lesson) => (
                    <Item key={lesson.id}>
                        <LessonCard
                            lesson={lesson}
                            done={completed.includes(lesson.id)}
                            open={open === lesson.id}
                            onToggleOpen={() => setOpen(open === lesson.id ? null : lesson.id)}
                            onComplete={() => toggleLesson(lesson.id)}
                        />
                    </Item>
                ))}
            </Stagger>
        </PremiumGate>
    );
}

/* ═══════════════════ Lesson ═══════════════════ */

function LessonCard({
    lesson,
    done,
    open,
    onToggleOpen,
    onComplete,
}: {
    lesson: Lesson;
    done: boolean;
    open: boolean;
    onToggleOpen: () => void;
    onComplete: () => void;
}) {
    const [picked, setPicked] = useState<number | null>(null);
    const track = TRACKS.find((t) => t.id === lesson.track)!;

    return (
        <Card className={open ? 'ring-1' : undefined}>
            <button
                onClick={onToggleOpen}
                className="w-full text-left p-4 flex items-start gap-3.5 transition-colors hover:bg-[var(--surface-2)]"
                aria-expanded={open}
            >
                <div
                    className="w-8 h-8 rounded-full grid place-items-center shrink-0 mt-0.5"
                    style={
                        done
                            ? { background: 'var(--accent)' }
                            : { background: 'var(--surface-3)', border: `1px solid ${track.color}44` }
                    }
                >
                    {done ? (
                        <Check size={14} strokeWidth={3} style={{ color: 'var(--accent-ink)' }} />
                    ) : (
                        <span className="w-2 h-2 rounded-full" style={{ background: track.color }} />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                        <p className={`text-[14px] font-semibold ${done ? 'text-lo' : 'text-hi'}`}>
                            {lesson.title}
                        </p>
                        <ChevronDown
                            size={16}
                            className="text-faint shrink-0 transition-transform duration-200"
                            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                        />
                    </div>

                    <p className="text-[12px] text-lo mt-1 leading-relaxed">
                        <span className="text-faint">Prevents: </span>
                        {lesson.prevents}
                    </p>

                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        <Badge tone="muted">{track.label}</Badge>
                        <Badge tone="muted">{lesson.minutes} min</Badge>
                        {lesson.level !== 'core' && <Badge tone="muted">{lesson.level}</Badge>}
                    </div>
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
                        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--line-subtle)' }}>
                            <p className="text-[13px] text-mid leading-[1.75] pt-4">{lesson.body}</p>

                            {/* Do this now */}
                            <div
                                className="mt-4 p-3.5 rounded-[var(--r-md)] flex items-start gap-2.5"
                                style={{ background: 'var(--gain-dim)', border: '1px solid rgba(0,232,134,0.2)' }}
                            >
                                <Target size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
                                <div>
                                    <p className="label mb-1" style={{ color: 'var(--accent)' }}>Do this now</p>
                                    <p className="text-[12.5px] text-mid leading-relaxed">{lesson.action}</p>
                                </div>
                            </div>

                            {/* Comprehension check */}
                            <div className="mt-4 well p-4">
                                <p className="label mb-2.5">Quick check</p>
                                <p className="text-[13px] text-hi font-medium mb-3">{lesson.quiz.q}</p>

                                <div className="space-y-1.5">
                                    {lesson.quiz.options.map((o, i) => {
                                        const isAnswer = i === lesson.quiz.answer;
                                        const chosen = picked === i;
                                        const reveal = picked !== null;

                                        return (
                                            <button
                                                key={o}
                                                onClick={() => setPicked(i)}
                                                disabled={reveal}
                                                className="w-full text-left px-3 py-2.5 rounded-[var(--r-sm)] text-[12.5px] flex items-start gap-2.5 transition-colors"
                                                style={{
                                                    background: reveal && isAnswer
                                                        ? 'var(--gain-dim)'
                                                        : chosen
                                                            ? 'var(--loss-dim)'
                                                            : 'var(--surface-3)',
                                                    border: `1px solid ${reveal && isAnswer
                                                        ? 'rgba(0,232,134,0.3)'
                                                        : chosen
                                                            ? 'rgba(255,77,109,0.3)'
                                                            : 'var(--line-subtle)'
                                                        }`,
                                                    color: reveal && isAnswer
                                                        ? 'var(--gain)'
                                                        : chosen
                                                            ? 'var(--loss)'
                                                            : 'var(--text)',
                                                    cursor: reveal ? 'default' : 'pointer',
                                                }}
                                            >
                                                {reveal && isAnswer && <CircleCheck size={14} className="mt-px shrink-0" />}
                                                {reveal && chosen && !isAnswer && <CircleX size={14} className="mt-px shrink-0" />}
                                                <span>{o}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {picked !== null && (
                                    <motion.p
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-[12px] text-lo leading-relaxed mt-3 pt-3"
                                        style={{ borderTop: '1px solid var(--line-subtle)' }}
                                    >
                                        {lesson.quiz.why}
                                    </motion.p>
                                )}
                            </div>

                            <button
                                onClick={onComplete}
                                className={`btn w-full mt-4 !text-[12.5px] ${done ? 'btn-secondary' : 'btn-primary'}`}
                            >
                                {done ? 'Mark as unread' : <>Mark complete <Check size={14} /></>}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}
