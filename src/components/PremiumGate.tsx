import { useState, type ReactNode } from 'react';
import { Crown, Check, Lock } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { PricingModal } from './PricingModal';

/* ═══════════════════════════════════════════════════════════════════
   Premium gate.

   The old behaviour redirected non-paying users away from these routes
   entirely — `<Navigate to="/dashboard/profile" />`. That is the worst
   possible paywall: the user never sees what they are not buying, and
   from their side the app just refuses to navigate.

   This shows the real page, blurred, behind an honest explanation of
   what is underneath. Standard practice in every subscription product
   that actually converts, and it is also just more respectful.
   ═══════════════════════════════════════════════════════════════════ */

export function PremiumGate({
    title,
    pitch,
    bullets,
    children,
}: {
    title: string;
    pitch: string;
    bullets: string[];
    children: ReactNode;
}) {
    const isPremium = useAppStore((s) => s.isPremium);
    const [pricing, setPricing] = useState(false);

    if (isPremium) return <>{children}</>;

    return (
        <>
            <div className="relative min-h-[560px]">
                {/* The real page, softened — not a mockup. */}
                <div
                    aria-hidden
                    className="pointer-events-none select-none"
                    style={{ filter: 'blur(7px) saturate(0.6)', opacity: 0.4 }}
                >
                    {children}
                </div>

                {/* Fade so the blurred content dissolves rather than
                    ending at a hard line. */}
                <div
                    className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
                    style={{
                        background: 'linear-gradient(to bottom, transparent, var(--bg-void) 65%)',
                    }}
                />

                <div className="absolute inset-0 grid place-items-start justify-center px-4 pt-12 overflow-hidden">
                    <div className="surface-raised max-w-md w-full p-6 text-center">
                        <div
                            className="w-11 h-11 rounded-[var(--r-md)] grid place-items-center mx-auto mb-3"
                            style={{ background: 'var(--warn-dim)', border: '1px solid rgba(255,176,32,0.25)' }}
                        >
                            <Lock size={19} style={{ color: 'var(--warn)' }} />
                        </div>

                        <h2 className="text-lg font-bold text-hi">{title}</h2>
                        <p className="text-[12.5px] text-lo mt-1.5 leading-relaxed">{pitch}</p>

                        <div className="well p-4 mt-4 text-left space-y-2.5">
                            {bullets.map((b) => (
                                <div key={b} className="flex items-start gap-2.5">
                                    <Check
                                        size={13}
                                        strokeWidth={3}
                                        className="mt-0.5 shrink-0"
                                        style={{ color: 'var(--accent)' }}
                                    />
                                    <span className="text-[12.5px] text-mid leading-snug">{b}</span>
                                </div>
                            ))}
                        </div>

                        <button onClick={() => setPricing(true)} className="btn btn-primary w-full mt-4">
                            <Crown size={15} /> Unlock with Premium
                        </button>
                        <p className="text-[10.5px] text-faint mt-2.5">
                            Demo build — unlocking is instant and free.
                        </p>
                    </div>
                </div>
            </div>

            <PricingModal open={pricing} onClose={() => setPricing(false)} />
        </>
    );
}
