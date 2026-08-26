import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Check, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

/* The pricing modal lived duplicated in both DashboardLayout and
   UserProfile with slightly different markup and prices drifting apart.
   One component now, imported by both. */

const FEATURES = [
    'AI Coach — six agents working on your actual numbers',
    'Learning Hub — the full curriculum, unlocked',
    'Quarterly Pulse — staged, tax-aware investing',
    'Tax Centre — regime comparison and harvesting alerts',
];

export function PricingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const setPremium = useAppStore((s) => s.setPremium);
    const [plan, setPlan] = useState<'monthly' | 'yearly'>('yearly');

    const activate = () => {
        setPremium(true);
        onClose();
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={onClose}
                    className="fixed inset-0 z-[100] grid place-items-center p-4"
                    style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Choose a plan"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
                        onClick={(e) => e.stopPropagation()}
                        className="surface-raised w-full max-w-md overflow-hidden"
                    >
                        <div className="relative p-6 pb-5 text-center border-b border-[var(--line-subtle)]">
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 btn btn-ghost !p-1.5"
                                aria-label="Close"
                            >
                                <X size={16} />
                            </button>

                            <div
                                className="w-11 h-11 rounded-[var(--r-md)] grid place-items-center mx-auto mb-3"
                                style={{ background: 'var(--warn-dim)', border: '1px solid rgba(255,176,32,0.25)' }}
                            >
                                <Crown size={20} style={{ color: 'var(--warn)' }} />
                            </div>
                            <h2 className="text-lg font-bold text-hi">Unlock the full picture</h2>
                            <p className="text-[12.5px] text-lo mt-1">
                                Everything that turns tracking into actual decisions
                            </p>
                        </div>

                        <div className="p-5 grid grid-cols-2 gap-3">
                            {([
                                { key: 'monthly' as const, price: '₹499', unit: '/mo', note: 'Billed monthly', tag: null },
                                { key: 'yearly' as const, price: '₹4,999', unit: '/yr', note: '₹416/mo · billed yearly', tag: 'SAVE 16%' },
                            ]).map((p) => {
                                const active = plan === p.key;
                                return (
                                    <button
                                        key={p.key}
                                        onClick={() => setPlan(p.key)}
                                        className="relative text-left p-4 rounded-[var(--r-md)] transition-all duration-200"
                                        style={{
                                            background: active ? 'var(--gain-dim)' : 'var(--surface-3)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                                        }}
                                    >
                                        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                            <span className="label">{p.key}</span>
                                            {p.tag && (
                                                <span
                                                    className="px-1.5 py-px rounded text-[9px] font-bold"
                                                    style={{ color: 'var(--warn)', background: 'var(--warn-dim)' }}
                                                >
                                                    {p.tag}
                                                </span>
                                            )}
                                        </div>
                                        <p className="num text-xl font-semibold text-hi">
                                            {p.price}
                                            <span className="text-[12px] font-normal text-faint">{p.unit}</span>
                                        </p>
                                        <p className="text-[10.5px] text-faint mt-1">{p.note}</p>

                                        {active && (
                                            <div
                                                className="absolute top-3 right-3 w-4 h-4 rounded-full grid place-items-center"
                                                style={{ background: 'var(--accent)' }}
                                            >
                                                <Check size={10} strokeWidth={3} style={{ color: 'var(--accent-ink)' }} />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="px-5 pb-5">
                            <div className="well p-4 space-y-2.5">
                                {FEATURES.map((f) => (
                                    <div key={f} className="flex items-start gap-2.5 text-[12.5px] text-mid">
                                        <Check
                                            size={13}
                                            strokeWidth={3}
                                            className="mt-0.5 shrink-0"
                                            style={{ color: 'var(--accent)' }}
                                        />
                                        <span>{f}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="px-5 pb-5 flex gap-2.5">
                            <button onClick={onClose} className="btn btn-secondary flex-1">
                                Not now
                            </button>
                            <button onClick={activate} className="btn btn-primary flex-1">
                                Continue — {plan === 'yearly' ? '₹4,999/yr' : '₹499/mo'}
                            </button>
                        </div>

                        <p className="text-[10.5px] text-faint text-center pb-5 px-5">
                            Demo build — activating is instant and charges nothing.
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
