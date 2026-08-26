import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

/* ═══════════════════════════════════════════════════════════════════
   Auth page — UI only.

   As instructed, the sign-in logic is untouched: submitting still calls
   completeOnboarding() and navigates straight to the dashboard with no
   credential check. That is the existing test harness and it stays.
   Everything below the logic line is presentation.

   What changed visually:
   • Three stacked full-screen canvas/SVG animations (a 45-node network
     with an O(n²) distance loop on every frame, a pulsing shield, and
     five sweeping gradient lines) became one lightweight particle
     field. The old set repainted continuously behind a static form.
   • The form is now a real form: labelled inputs, a working password
     reveal, autocomplete hints, and a visible focus ring.
   ═══════════════════════════════════════════════════════════════════ */

/* ─── Ambient particle field ───────────────────────────────────────
   One canvas, no per-frame neighbour search. Particles drift upward
   and wrap; the cost is linear and it idles near zero CPU. */
function ParticleField() {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let w = (canvas.width = window.innerWidth);
        let h = (canvas.height = window.innerHeight);

        const COUNT = 46;
        const parts = Array.from({ length: COUNT }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: Math.random() * 1.6 + 0.5,
            v: Math.random() * 0.22 + 0.06,
            a: Math.random() * 0.35 + 0.08,
        }));

        let raf = 0;

        const paint = () => {
            ctx.clearRect(0, 0, w, h);
            for (const p of parts) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 232, 134, ${p.a})`;
                ctx.fill();
            }
        };

        const step = () => {
            for (const p of parts) {
                p.y -= p.v;
                if (p.y < -8) {
                    p.y = h + 8;
                    p.x = Math.random() * w;
                }
            }
            paint();
            raf = requestAnimationFrame(step);
        };

        // Honour reduced-motion: render one static frame and stop.
        if (reduce) paint();
        else step();

        const onResize = () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', onResize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', onResize);
        };
    }, []);

    return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden />;
}

/* ─── Field ─── */
function Field({
    label,
    type,
    placeholder,
    autoComplete,
    name,
}: {
    label: string;
    type: string;
    placeholder: string;
    autoComplete?: string;
    name: string;
}) {
    const [show, setShow] = useState(false);
    const isPassword = type === 'password';

    return (
        <div>
            <label htmlFor={name} className="label block mb-1.5">
                {label}
            </label>
            <div className="relative">
                <input
                    id={name}
                    name={name}
                    type={isPassword && show ? 'text' : type}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    className="field !py-3"
                    style={isPassword ? { paddingRight: 44 } : undefined}
                />
                {isPassword && (
                    <button
                        type="button"
                        onClick={() => setShow((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-[var(--r-sm)] text-faint hover:text-hi transition-colors"
                        aria-label={show ? 'Hide password' : 'Show password'}
                    >
                        {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════ Page ═══════════════════════════ */

export default function AuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const navigate = useNavigate();

    /* ── UNCHANGED: existing test-mode sign-in ── */
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const completeOnboarding = useAppStore.getState().completeOnboarding;
        completeOnboarding();
        setTimeout(() => {
            navigate('/dashboard');
        }, 100);
    };

    return (
        <div
            className="min-h-screen grid lg:grid-cols-2"
            style={{ background: 'var(--bg-void)' }}
        >
            {/* ─── Left: the pitch. Empty space on a sign-in screen is a
                   wasted chance to say what the product does. ─── */}
            <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden"
                style={{ background: 'var(--bg-base)', borderRight: '1px solid var(--line-subtle)' }}>
                <ParticleField />
                <div
                    className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full pointer-events-none animate-drift"
                    style={{ background: 'rgba(0,232,134,0.05)', filter: 'blur(120px)' }}
                />

                <Link to="/" className="relative flex items-center gap-2.5 w-fit">
                    <div
                        className="w-8 h-8 rounded-[10px] grid place-items-center"
                        style={{ background: 'var(--accent)' }}
                    >
                        <span className="font-display font-extrabold text-[15px]" style={{ color: 'var(--accent-ink)' }}>
                            S
                        </span>
                    </div>
                    <span className="font-display font-bold text-[15px] text-hi">SalaryPilot</span>
                </Link>

                <div className="relative max-w-md">
                    <h2 className="text-[32px] font-bold text-hi leading-[1.2] tracking-tight">
                        Know exactly how long
                        <br />
                        you could last.
                    </h2>
                    <p className="text-[14px] text-lo mt-4 leading-relaxed">
                        Most finance apps show you what you own. SalaryPilot shows you what
                        happens if the income stops — and ranks every move by how much it
                        actually changes that answer.
                    </p>

                    <div className="mt-8 space-y-3">
                        {[
                            ['Runway', 'Months you survive with zero income, after real sale haircuts'],
                            ['Freedom Score', 'Five pillars, each with its working shown'],
                            ['Leak Hunter', 'Money leaving quietly — subscriptions, interest, idle cash'],
                        ].map(([k, v]) => (
                            <div key={k} className="flex items-start gap-3">
                                <div
                                    className="w-1.5 h-1.5 rounded-full mt-[7px] shrink-0"
                                    style={{ background: 'var(--accent)' }}
                                />
                                <p className="text-[13px] text-lo">
                                    <span className="text-hi font-semibold">{k}</span> — {v}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="relative text-[11px] text-faint">
                    Built for the AMD Pervasive AI Developer Contest
                </p>
            </div>

            {/* ─── Right: the form ─── */}
            <div className="flex items-center justify-center p-6 sm:p-12">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
                    className="w-full max-w-[380px]"
                >
                    <Link to="/" className="lg:hidden flex items-center gap-2.5 mb-8">
                        <div
                            className="w-8 h-8 rounded-[10px] grid place-items-center"
                            style={{ background: 'var(--accent)' }}
                        >
                            <span className="font-display font-extrabold text-[15px]" style={{ color: 'var(--accent-ink)' }}>
                                S
                            </span>
                        </div>
                        <span className="font-display font-bold text-[15px] text-hi">SalaryPilot</span>
                    </Link>

                    <h1 className="text-[26px] font-bold text-hi tracking-tight">
                        {isLogin ? 'Welcome back' : 'Create your account'}
                    </h1>
                    <p className="text-[13px] text-lo mt-1.5">
                        {isLogin
                            ? 'Pick up where your numbers left off.'
                            : 'Two minutes to your first runway figure.'}
                    </p>

                    <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                        <AnimatePresence initial={false}>
                            {!isLogin && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                                    className="overflow-hidden"
                                >
                                    <div className="pb-4">
                                        <Field
                                            label="Full name"
                                            name="name"
                                            type="text"
                                            placeholder="Aditya Menon"
                                            autoComplete="name"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <Field
                            label="Email"
                            name="email"
                            type="email"
                            placeholder="you@company.com"
                            autoComplete="email"
                        />
                        <Field
                            label="Password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                        />

                        {isLogin && (
                            <div className="flex justify-end">
                                <button type="button" className="text-[12px] text-accent hover:underline">
                                    Forgot password?
                                </button>
                            </div>
                        )}

                        <button type="submit" className="btn btn-primary w-full !py-3">
                            {isLogin ? 'Sign in' : 'Create account'} <ArrowRight size={15} />
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full" style={{ borderTop: '1px solid var(--line-subtle)' }} />
                        </div>
                        <div className="relative flex justify-center">
                            <span className="px-3 label" style={{ background: 'var(--bg-void)' }}>
                                or continue with
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                        {[
                            {
                                label: 'Google',
                                svg: (
                                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                ),
                            },
                            {
                                label: 'Apple',
                                svg: (
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                                    </svg>
                                ),
                            },
                            {
                                label: 'GitHub',
                                svg: (
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                                    </svg>
                                ),
                            },
                        ].map((p) => (
                            <button
                                key={p.label}
                                type="button"
                                aria-label={`Continue with ${p.label}`}
                                className="btn btn-secondary !py-2.5 text-lo hover:text-hi"
                            >
                                {p.svg}
                            </button>
                        ))}
                    </div>

                    <p className="text-[13px] text-lo text-center mt-7">
                        {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                        <button
                            onClick={() => setIsLogin((v) => !v)}
                            className="font-semibold text-accent hover:underline"
                        >
                            {isLogin ? 'Sign up' : 'Sign in'}
                        </button>
                    </p>

                    <div
                        className="flex items-center justify-center gap-2 mt-8 pt-5"
                        style={{ borderTop: '1px solid var(--line-subtle)' }}
                    >
                        <ShieldCheck size={13} className="text-faint" />
                        <p className="text-[11px] text-faint">
                            Demo build — any credentials will sign you in
                        </p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
