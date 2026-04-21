import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';

/* ─── Animated Node Network (Neon) ─── */
const NodeNetwork = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let animId: number;
        let width = (canvas.width = window.innerWidth);
        let height = (canvas.height = window.innerHeight);
        const NODE_COUNT = 45;
        const CONNECTION_DIST = 170;
        class Node {
            x: number; y: number; vx: number; vy: number; radius: number;
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.35;
                this.vy = (Math.random() - 0.5) * 0.35;
                this.radius = Math.random() * 2 + 0.8;
            }
            update() {
                this.x += this.vx; this.y += this.vy;
                if (this.x < 0 || this.x > width) this.vx *= -1;
                if (this.y < 0 || this.y > height) this.vy *= -1;
            }
        }
        const nodes = Array.from({ length: NODE_COUNT }, () => new Node());
        const draw = () => {
            ctx.clearRect(0, 0, width, height);
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[i].x - nodes[j].x;
                    const dy = nodes[i].y - nodes[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < CONNECTION_DIST) {
                        const alpha = (1 - dist / CONNECTION_DIST) * 0.15;
                        ctx.beginPath();
                        ctx.moveTo(nodes[i].x, nodes[i].y);
                        ctx.lineTo(nodes[j].x, nodes[j].y);
                        ctx.strokeStyle = `rgba(0, 255, 136, ${alpha})`;
                        ctx.lineWidth = 0.6;
                        ctx.stroke();
                    }
                }
            }
            nodes.forEach((n) => {
                n.update();
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 255, 136, 0.3)';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius + 3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 255, 136, 0.06)';
                ctx.fill();
            });
            animId = requestAnimationFrame(draw);
        };
        draw();
        const handleResize = () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; };
        window.addEventListener('resize', handleResize);
        return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', handleResize); };
    }, []);
    return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-[1]" />;
};

/* ─── Shield Pulse ─── */
const ShieldPulse = () => (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[0]">
        <motion.svg width="550" height="550" viewBox="0 0 200 200" fill="none" className="opacity-[0.12]"
            animate={{ scale: [1, 1.04, 1], opacity: [0.08, 0.15, 0.08] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
            <path d="M100 15 L175 55 L175 110 C175 155 140 185 100 195 C60 185 25 155 25 110 L25 55 Z" stroke="url(#shieldNeon)" strokeWidth="1.5" fill="none" />
            <path d="M100 35 L155 65 L155 105 C155 140 130 165 100 175 C70 165 45 140 45 105 L45 65 Z" stroke="url(#shieldNeon)" strokeWidth="0.8" fill="none" opacity="0.5" />
            <rect x="88" y="90" width="24" height="20" rx="3" stroke="rgba(0,255,136,0.4)" strokeWidth="1.5" fill="none" />
            <path d="M93 90 V82 A7 7 0 0 1 107 82 V90" stroke="rgba(0,255,136,0.4)" strokeWidth="1.5" fill="none" />
            <circle cx="100" cy="102" r="2.5" fill="rgba(0,255,136,0.4)" />
            <defs>
                <linearGradient id="shieldNeon" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#00ff88" />
                    <stop offset="50%" stopColor="#00c8ff" />
                    <stop offset="100%" stopColor="#ff0080" />
                </linearGradient>
            </defs>
        </motion.svg>
    </div>
);

/* ─── Data Streams ─── */
const DataStreams = () => {
    const streams = useMemo(() => [
        { y: '18%', dur: 4, delay: 0, color: '#00ff88' },
        { y: '35%', dur: 6, delay: 1.5, color: '#ff0080' },
        { y: '55%', dur: 5, delay: 0.8, color: '#00c8ff' },
        { y: '72%', dur: 7, delay: 2, color: '#ffaa00' },
        { y: '88%', dur: 4.5, delay: 3, color: '#00ff88' },
    ], []);
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-[0]">
            {streams.map((s, i) => (
                <motion.div key={i} className="absolute left-0 h-px"
                    style={{ top: s.y, background: `linear-gradient(90deg, transparent, ${s.color}25, transparent)`, width: '100%' }}
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: 'linear' }} />
            ))}
        </div>
    );
};

/* ─── Input ─── */
const InputGroup = ({ label, type, placeHolder }: { label: string; type: string; placeHolder: string }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-400 ml-1 block tracking-wide uppercase">{label}</label>
        <div className="relative group">
            <input type={type} placeholder={placeHolder}
                className="w-full bg-white/[0.04] border border-[#00ff88]/15 rounded-xl px-4 py-3.5 text-white placeholder-slate-600 focus:outline-none focus:border-[#00ff88]/40 focus:ring-2 focus:ring-[#00ff88]/15 transition-all duration-300 backdrop-blur-sm font-light" />
        </div>
    </div>
);

const SocialButton = ({ children, label }: { children: React.ReactNode; label: string }) => (
    <button type="button" aria-label={label}
        className="flex items-center justify-center gap-2 px-4 py-3 border border-[#00ff88]/15 rounded-xl bg-white/[0.03] hover:bg-[#00ff88]/5 hover:border-[#00ff88]/30 transition-all duration-300 group backdrop-blur-sm">
        {children}
    </button>
);

/* ═══════════════════════════ AUTH PAGE ═══════════════════════════ */
export default function AuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const navigate = useNavigate();
    const toggleAuth = () => setIsLogin(!isLogin);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const completeOnboarding = useAppStore.getState().completeOnboarding;
        completeOnboarding();
        setTimeout(() => { navigate('/dashboard'); }, 100);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #0d1224 50%, #0a0e1a 100%)' }}>

            {/* ── Neon ambient blobs (dashboard style) ── */}
            <div className="absolute inset-0 z-0">
                <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#00ff88]/[0.06] blur-[150px] animate-breathe" />
                <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-[#ff0080]/[0.05] blur-[130px] animate-float-slow" />
                <div className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] rounded-full bg-[#00c8ff]/[0.04] blur-[120px] animate-float-slower" />
                <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-[#ffaa00]/[0.04] blur-[100px] animate-float" />
            </div>

            {/* ── Node Network (neon green) ── */}
            <NodeNetwork />
            <ShieldPulse />
            <DataStreams />

            {/* ── Subtle vignette ── */}
            <div className="absolute inset-0 pointer-events-none z-[2]"
                style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(10,14,26,0.6) 100%)' }} />

            {/* ═══════ FORM CARD — dark glass with neon + landing accents ═══════ */}
            <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-md relative z-10">

                <div className="rounded-2xl p-8 relative overflow-hidden"
                    style={{
                        background: 'rgba(12,16,35,0.7)',
                        backdropFilter: 'blur(24px) saturate(1.4)',
                        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
                        border: '1px solid rgba(0,255,136,0.15)',
                        boxShadow: '0 0 2px rgba(0,255,136,0.3), 0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03), 0 0 60px rgba(0,255,136,0.04)'
                    }}>
                    {/* Landing-style emerald accent glow at top */}
                    <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[300px] h-[200px] bg-gradient-to-b from-emerald-500/10 via-[#00ff88]/5 to-transparent rounded-full blur-[60px] pointer-events-none" />

                    <div className="text-center mb-8 relative z-10">
                        <Link to="/" className="inline-block mb-4 hover:opacity-80 transition-opacity">
                            <span className="text-2xl font-display font-bold tracking-tight">
                                <span className="text-white">Salary</span>
                                <span className="text-[#00ff88]" style={{ textShadow: '0 0 12px rgba(0,255,136,0.4)' }}>Pilot</span>
                            </span>
                        </Link>
                        <h2 className="text-2xl font-display font-bold text-white mb-2 tracking-tight">
                            {isLogin ? 'Welcome Back' : 'Create Account'}
                        </h2>
                        <p className="text-slate-500 text-sm font-light">
                            {isLogin ? 'Securely access your wealth dashboard' : 'Start your journey to financial freedom'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
                        <AnimatePresence>
                            {!isLogin && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                    <div className="pb-4"><InputGroup label="Full Name" type="text" placeHolder="John Doe" /></div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <InputGroup label="Email Address" type="email" placeHolder="john@example.com" />
                        <InputGroup label="Password" type="password" placeHolder="••••••••" />

                        {/* Landing-style emerald button + neon glow */}
                        <Button type="submit"
                            className="w-full mt-6 py-3.5 font-bold transition-all duration-300 hover:scale-[1.02] active:scale-100 rounded-xl border-0 text-black"
                            variant="primary"
                            style={{
                                background: 'linear-gradient(135deg, #00ff88, #00c8ff)',
                                boxShadow: '0 0 20px rgba(0,255,136,0.3), 0 4px 12px rgba(0,0,0,0.3)',
                            } as any}>
                            {isLogin ? 'Sign In' : 'Create Account'}
                        </Button>
                    </form>

                    <div className="mt-8 relative z-10">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#00ff88]/10" /></div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-[#0c1023]/80 backdrop-blur-sm px-3 text-slate-500 font-medium tracking-wider">Or continue with</span>
                            </div>
                        </div>
                        <div className="mt-6 grid grid-cols-3 gap-3">
                            <SocialButton label="Google">
                                <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                            </SocialButton>
                            <SocialButton label="Apple">
                                <svg className="w-5 h-5 text-slate-300 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
                            </SocialButton>
                            <SocialButton label="GitHub">
                                <svg className="w-5 h-5 text-slate-300 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
                            </SocialButton>
                        </div>
                    </div>

                    <div className="mt-8 text-center text-sm relative z-10">
                        <p className="text-slate-500">
                            {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                            <button onClick={toggleAuth} className="font-semibold text-[#00ff88] hover:text-[#00ff88]/80 transition-colors" style={{ textShadow: '0 0 8px rgba(0,255,136,0.3)' }}>
                                {isLogin ? 'Sign up' : 'Log in'}
                            </button>
                        </p>
                    </div>
                </div>

                <div className="mt-6 text-center opacity-60 hover:opacity-100 transition-opacity">
                    <p className="text-xs text-slate-500 flex items-center justify-center gap-2 font-light">
                        <span>🔒 Bank-grade encryption</span>
                        <span>•</span>
                        <span>256-bit SSL secure</span>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
