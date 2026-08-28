import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

// Same check GoogleSignInButton makes internally - kept in sync here so the
// "or continue with" divider and the button appear or disappear together.
const GOOGLE_CONFIGURED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

/* ═══════════════════════════════════════════════════════════════════
   Auth page.

   The bypass is gone. Submitting used to call completeOnboarding() and
   navigate to the dashboard without looking at what was typed — fine as
   a test harness, fatal for an app that now stores one person's salary,
   debts and wallet balance under their own account. Credentials go to
   the API, and the session that comes back is what unlocks the app.

   Two things that are deliberately NOT here:

   • The social sign-in row. Three buttons that did nothing when clicked
     is a worse first impression than not offering them. They come back
     when there is an OAuth provider behind them.

   • "Any credentials will sign you in." It is no longer true.

   The visual work is unchanged: one lightweight particle field instead
   of three stacked full-screen canvases, and a real labelled form.
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

/* ─── Field ───────────────────────────────────────────────────────
   Controlled now. The old version had no value or onChange at all, so
   what the user typed lived only in the DOM and was unreachable by the
   submit handler — which is why the bypass was the only thing it could
   possibly have done. */
function Field({
    label,
    type,
    placeholder,
    autoComplete,
    name,
    value,
    onChange,
    hint,
    required = true,
    minLength,
}: {
    label: string;
    type: string;
    placeholder: string;
    autoComplete?: string;
    name: string;
    value: string;
    onChange: (v: string) => void;
    hint?: string;
    required?: boolean;
    minLength?: number;
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
                    value={value}
                    required={required}
                    minLength={minLength}
                    onChange={(e) => onChange(e.target.value)}
                    className="field !py-3"
                    style={isPassword ? { paddingRight: 44 } : undefined}
                />
                {isPassword && (
                    <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-[var(--r-sm)] text-faint hover:text-hi transition-colors"
                        aria-label={show ? 'Hide password' : 'Show password'}
                    >
                        {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                )}
            </div>
            {hint && <p className="text-[11px] text-faint mt-1.5">{hint}</p>}
        </div>
    );
}

/* ═══════════════════════════ Page ═══════════════════════════ */

const MIN_PASSWORD = 12; // matches the server; NIST SP 800-63B length-only

export default function AuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const status = useAuthStore((s) => s.status);
    const busy = useAuthStore((s) => s.busy);
    const error = useAuthStore((s) => s.error);
    const signIn = useAuthStore((s) => s.signIn);
    const signUp = useAuthStore((s) => s.signUp);
    const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
    const clearError = useAuthStore((s) => s.clearError);

    // Clear a stale error when switching mode, so "email or password is
    // incorrect" does not sit above a fresh sign-up form.
    useEffect(() => {
        clearError();
    }, [isLogin, clearError]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return; // a double-submit would be a second POST

        const ok = isLogin
            ? await signIn(email.trim(), password)
            : await signUp(email.trim(), password, name.trim());

        // Only navigate on success. The old handler navigated
        // unconditionally, which is precisely what made it a bypass.
        if (ok) navigate('/dashboard', { replace: true });
    };

    const handleGoogleToken = async (idToken: string) => {
        if (busy) return;
        const ok = await signInWithGoogle(idToken);
        if (ok) navigate('/dashboard', { replace: true });
    };

    // Already signed in — nothing here to do. `replace` keeps Back from
    // bouncing between the dashboard and a login page it cannot show.
    if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

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

                    {/* The server is the only thing that can reject a
                        credential, so its message is what is shown. */}
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            role="alert"
                            className="flex items-start gap-2.5 mt-6 p-3 rounded-[var(--r-md)]"
                            style={{
                                background: 'rgba(255,86,86,0.08)',
                                border: '1px solid rgba(255,86,86,0.22)',
                            }}
                        >
                            <AlertCircle size={15} className="shrink-0 mt-[1px]" style={{ color: 'var(--neg)' }} />
                            <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--neg)' }}>
                                {error}
                            </p>
                        </motion.div>
                    )}

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
                                            value={name}
                                            onChange={setName}
                                            required={false}
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
                            value={email}
                            onChange={setEmail}
                        />
                        <Field
                            label="Password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                            value={password}
                            onChange={setPassword}
                            minLength={isLogin ? undefined : MIN_PASSWORD}
                            hint={
                                isLogin
                                    ? undefined
                                    : `At least ${MIN_PASSWORD} characters. Length beats symbols — a passphrase is fine.`
                            }
                        />

                        {isLogin && (
                            <div className="flex justify-end">
                                <button type="button" className="text-[12px] text-accent hover:underline">
                                    Forgot password?
                                </button>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="btn btn-primary w-full !py-3 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {busy ? (
                                <>
                                    <Loader2 size={15} className="animate-spin" />
                                    {isLogin ? 'Signing in' : 'Creating account'}
                                </>
                            ) : (
                                <>
                                    {isLogin ? 'Sign in' : 'Create account'} <ArrowRight size={15} />
                                </>
                            )}
                        </button>
                    </form>

                    {/* The SAME check GoogleSignInButton makes internally,
                        checked again here — deliberately, so the divider
                        and the button appear or disappear together. An "or
                        continue with" line above an empty space (Google not
                        configured) would be worse than showing neither. */}
                    {GOOGLE_CONFIGURED && (
                        <>
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
                            <GoogleSignInButton onToken={(t) => void handleGoogleToken(t)} disabled={busy} />
                        </>
                    )}

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
                            Passwords hashed with argon2id. Wallet money is simulated.
                        </p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
