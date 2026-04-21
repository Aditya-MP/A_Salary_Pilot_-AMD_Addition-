import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';
import Navbar from '../components/layout/Navbar';
import { Button } from '../components/ui/Button';
import { Link } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import UltraBackground from '../components/landing/UltraBackground';
import { Shield, Zap, Brain, Lock, ArrowRight, Star, Users, Coins, Award, BarChart3 } from 'lucide-react';

/* ─── Animated Counter ─── */
function AnimatedCounter({ target, suffix = '', prefix = '' }: { target: number; suffix?: string; prefix?: string }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-60px' });
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!isInView) return;
        let start = 0;
        const end = target;
        const duration = 2000;
        const step = end / (duration / 16);
        const timer = setInterval(() => {
            start += step;
            if (start >= end) { setCount(end); clearInterval(timer); }
            else setCount(Math.floor(start));
        }, 16);
        return () => clearInterval(timer);
    }, [isInView, target]);

    return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

/* ─── Floating Particle (kept subtle) ─── */
const FloatingParticle = ({ delay }: { delay: number }) => (
    <motion.div
        animate={{ y: [0, -120], opacity: [0, 0.4, 0], scale: [0.5, 1.2, 0.3] }}
        transition={{ duration: Math.random() * 6 + 5, repeat: Infinity, delay, ease: 'linear' }}
        style={{ left: `${Math.random() * 100}%`, top: '100%' }}
        className="absolute w-1 h-1 bg-emerald-400 rounded-full blur-[1px]"
    />
);

/* ─── Hero ─── */
const Hero = () => {
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
    const y = useTransform(scrollYProgress, [0, 1], ['0%', '40%']);
    const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
    const scale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);

    const springX = useSpring(0, { stiffness: 100, damping: 30 });
    const springY = useSpring(0, { stiffness: 100, damping: 30 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            springX.set((e.clientX - window.innerWidth / 2) / 60);
            springY.set((e.clientY - window.innerHeight / 2) / 60);
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [springX, springY]);

    return (
        <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-50">
            {/* Cinematic Background */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-mesh-gradient opacity-20 animate-pulse-slow mix-blend-multiply" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#f8fafc_100%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
                {[...Array(15)].map((_, i) => <FloatingParticle key={i} delay={i * 0.6} />)}
            </div>

            <UltraBackground />

            <motion.div
                style={{ y, opacity, scale, x: springX, rotateX: springY, perspective: 1200 }}
                className="relative z-10 container mx-auto px-6 text-center pt-20"
            >
                {/* Badge */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.85, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="inline-flex items-center gap-2.5 mb-6 px-5 py-2 rounded-full border border-emerald-200/60 bg-white/80 backdrop-blur-md shadow-sm"
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-emerald-700 text-xs font-semibold tracking-wider uppercase">AI-Powered Wealth Management</span>
                </motion.div>

                {/* Headline */}
                <motion.h1
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                    className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-bold mb-6 tracking-tight leading-[1.05] text-navy-900"
                >
                    <span className="block">Smarter Finance.</span>
                    <span className="block mt-1 text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 pb-2">
                        Effortless Control.
                    </span>
                </motion.h1>

                {/* Subheadline */}
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.15, ease: 'easeOut' }}
                    className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed"
                >
                    Experience <span className="text-navy-900 font-medium">next-generation</span> wealth management with real-time AI insights,
                    automated salary routing, and institutional-grade security.
                </motion.p>

                {/* CTA Buttons */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
                    className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
                >
                    <Link to="/signup">
                        <Button size="lg" className="group relative overflow-hidden bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-10 py-4 shadow-lg shadow-emerald-500/25 transition-all duration-300 hover:scale-[1.03] border-0 rounded-2xl shimmer">
                            <span className="relative z-10 flex items-center gap-2">
                                Get Started Free
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </span>
                        </Button>
                    </Link>
                    <Button variant="outline" size="lg" className="group border-slate-200 hover:bg-white hover:border-emerald-300 px-10 py-4 shadow-sm rounded-2xl bg-white/50 backdrop-blur-sm">
                        <span className="text-slate-600 font-medium group-hover:text-navy-900 transition-colors flex items-center gap-2">
                            Watch Demo
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        </span>
                    </Button>
                </motion.div>

                {/* Trust Bar */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.5 }}
                    className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400"
                >
                    <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Bank-grade encryption</span>
                    <span className="hidden sm:block w-1 h-1 rounded-full bg-slate-300" />
                    <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> SEBI compliant</span>
                    <span className="hidden sm:block w-1 h-1 rounded-full bg-slate-300" />
                    <span className="flex items-center gap-1.5">
                        <div className="flex -space-x-1">
                            {[...Array(5)].map((_, i) => <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />)}
                        </div>
                        4.9/5 Rating
                    </span>
                </motion.div>
            </motion.div>

            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,#f8fafc_100%)] opacity-40" />
        </section>
    );
};

/* ─── Stats Bar ─── */
const StatsBar = () => (
    <section className="relative py-16 bg-white border-y border-slate-100">
        <div className="container mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
                {[
                    { value: 50000, suffix: '+', label: 'Active Users', icon: Users },
                    { value: 120, suffix: 'Cr+', prefix: '₹', label: 'Assets Managed', icon: Coins },
                    { value: 99, suffix: '.9%', label: 'Uptime SLA', icon: Zap },
                    { value: 4, suffix: ' Awards', label: 'Industry Recognition', icon: Award },
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: i * 0.1 }}
                        className="text-center group"
                    >
                        <stat.icon className="w-5 h-5 text-emerald-500 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                        <p className="text-3xl md:text-4xl font-bold text-navy-900 stat-highlight inline-block">
                            <AnimatedCounter target={stat.value} suffix={stat.suffix} prefix={stat.prefix || ''} />
                        </p>
                        <p className="text-sm text-slate-400 mt-1">{stat.label}</p>
                    </motion.div>
                ))}
            </div>
        </div>
    </section>
);

/* ─── Features ─── */
const Features = () => {
    const features = [
        {
            icon: Brain, color: 'emerald', emoji: '🤖',
            title: 'AI Wealth Coach',
            description: 'Real-time portfolio analysis powered by advanced ML models that adapt to market conditions and your personal risk tolerance.',
            highlights: ['Tax optimization', 'Risk alerts', 'Smart rebalancing'],
        },
        {
            icon: BarChart3, color: 'blue', emoji: '💸',
            title: 'Smart Salary Split',
            description: 'Automate savings and investments the moment your salary hits. Intelligent routing with tax-optimization strategies built in.',
            highlights: ['Auto-routing', 'Tax-efficient', 'Custom splits'],
        },
        {
            icon: Shield, color: 'purple', emoji: '🛡️',
            title: 'Triple Guard Risk',
            description: 'Proprietary risk management that protects capital against volatility, emotional decisions, and downside risks.',
            highlights: ['Emotion check', 'Peer benchmark', 'Streak protector'],
        },
    ];

    return (
        <section className="py-28 relative overflow-hidden bg-slate-50">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
            </div>

            <div className="container mx-auto px-6 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    className="text-center mb-20"
                >
                    <span className="inline-block text-emerald-600 text-xs font-bold tracking-widest uppercase mb-3 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/50">
                        Core Features
                    </span>
                    <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-navy-900 mb-5 tracking-tight">
                        Institutional-Grade Power
                    </h2>
                    <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                        Built for serious investors who demand precision, speed, and intelligence.
                    </p>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
                    {features.map((feature, i) => (
                        <GlassCard key={i} delay={i * 0.12} className="p-8 group">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center mb-6 border border-emerald-200/40 shadow-sm group-hover:shadow-emerald-500/10 group-hover:shadow-md transition-all duration-300">
                                <span className="text-3xl">{feature.emoji}</span>
                            </div>
                            <h3 className="text-xl font-display font-bold text-navy-900 mb-3">{feature.title}</h3>
                            <p className="text-slate-500 leading-relaxed text-sm mb-5">
                                {feature.description}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {feature.highlights.map((h) => (
                                    <span key={h} className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/50 rounded-full px-3 py-1">
                                        {h}
                                    </span>
                                ))}
                            </div>
                        </GlassCard>
                    ))}
                </div>
            </div>
        </section>
    );
};

/* ─── How It Works ─── */
const HowItWorks = () => {
    const steps = [
        { step: '01', title: 'Connect Your Salary', desc: 'Link your bank account and set your salary. SalaryPilot detects every credit automatically.' },
        { step: '02', title: 'Configure Your Split', desc: 'Set custom percentages for savings, investments, and expenses. AI optimizes based on your goals.' },
        { step: '03', title: 'Watch Your Wealth Grow', desc: 'Triple Guard protects every decision. Quarterly Pulse ensures optimal market timing.' },
    ];

    return (
        <section className="py-28 bg-white relative overflow-hidden">
            <div className="container mx-auto px-6">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    className="text-center mb-20"
                >
                    <span className="inline-block text-blue-600 text-xs font-bold tracking-widest uppercase mb-3 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/50">
                        How It Works
                    </span>
                    <h2 className="text-4xl md:text-5xl font-display font-bold text-navy-900 mb-5 tracking-tight">
                        Three Simple Steps
                    </h2>
                    <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                        Get started in under 2 minutes. No paperwork, no complexity.
                    </p>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-8 relative">
                    {/* Connector line */}
                    <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px bg-gradient-to-r from-emerald-200 via-blue-200 to-purple-200" />

                    {steps.map((s, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: i * 0.15 }}
                            className="relative text-center group"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-6 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                                {s.step}
                            </div>
                            <h3 className="text-lg font-bold text-navy-900 mb-2">{s.title}</h3>
                            <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto">{s.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

/* ─── Testimonials ─── */
const Testimonials = () => {
    const testimonials = [
        { name: 'Priya Sharma', role: 'Software Engineer', text: 'SalaryPilot transformed how I manage money. The AI coach helped me save 30% more in 3 months.', avatar: '👩‍💻' },
        { name: 'Rahul Mehta', role: 'Business Analyst', text: 'Triple Guard literally saved me from panic-selling during the market dip. Best financial tool ever.', avatar: '👨‍💼' },
        { name: 'Ananya Rao', role: 'Product Designer', text: 'The quarterly pulse strategy is genius. I no longer stress about market timing.', avatar: '👩‍🎨' },
    ];

    return (
        <section className="py-28 bg-slate-50 relative overflow-hidden">
            <div className="container mx-auto px-6">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    className="text-center mb-16"
                >
                    <span className="inline-block text-amber-600 text-xs font-bold tracking-widest uppercase mb-3 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/50">
                        Testimonials
                    </span>
                    <h2 className="text-4xl md:text-5xl font-display font-bold text-navy-900 mb-5 tracking-tight">
                        Loved by Investors
                    </h2>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-6">
                    {testimonials.map((t, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: i * 0.1 }}
                            className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-300 hover:-translate-y-1"
                        >
                            <div className="flex items-center gap-1 mb-4">
                                {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
                            </div>
                            <p className="text-slate-600 text-sm leading-relaxed mb-5">"{t.text}"</p>
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{t.avatar}</span>
                                <div>
                                    <p className="text-navy-900 font-semibold text-sm">{t.name}</p>
                                    <p className="text-slate-400 text-xs">{t.role}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

/* ─── Final CTA ─── */
const FinalCTA = () => (
    <section className="py-28 bg-white relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-30">
            <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full bg-emerald-100 blur-[100px]" />
            <div className="absolute bottom-1/4 left-1/4 w-80 h-80 rounded-full bg-blue-100 blur-[100px]" />
        </div>

        <div className="container mx-auto px-6 relative z-10">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
                className="max-w-3xl mx-auto text-center"
            >
                <h2 className="text-4xl md:text-5xl font-display font-bold text-navy-900 mb-5 tracking-tight">
                    Ready to Take Control of <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">Your Financial Future?</span>
                </h2>
                <p className="text-slate-500 text-lg mb-10 max-w-xl mx-auto">
                    Join 50,000+ professionals who trust SalaryPilot to grow their wealth intelligently.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link to="/signup">
                        <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-12 py-4 shadow-xl shadow-emerald-500/25 rounded-2xl shimmer border-0">
                            <span className="relative z-10 flex items-center gap-2">
                                Start Free Today <ArrowRight className="w-5 h-5" />
                            </span>
                        </Button>
                    </Link>
                    <p className="text-xs text-slate-400">No credit card required • Free forever tier</p>
                </div>
            </motion.div>
        </div>
    </section>
);

/* ─── Footer ─── */
const Footer = () => (
    <footer className="bg-slate-50 border-t border-slate-100 pt-16 pb-8">
        <div className="container mx-auto px-6">
            <div className="grid md:grid-cols-4 gap-10 mb-12">
                <div className="md:col-span-1">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-500/25">
                            <span className="font-bold text-white text-lg">S</span>
                        </div>
                        <span className="text-xl font-display font-bold text-navy-900">
                            Salary<span className="text-emerald-600">Pilot</span>
                        </span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                        AI-powered wealth management for the modern professional.
                    </p>
                </div>

                {[
                    { title: 'Product', links: ['Features', 'Pricing', 'Security', 'Roadmap'] },
                    { title: 'Company', links: ['About', 'Careers', 'Blog', 'Press'] },
                    { title: 'Legal', links: ['Privacy', 'Terms', 'Compliance', 'Contact'] },
                ].map((col) => (
                    <div key={col.title}>
                        <p className="text-sm font-semibold text-navy-900 mb-3">{col.title}</p>
                        <div className="space-y-2">
                            {col.links.map((link) => (
                                <a key={link} href="#" className="block text-sm text-slate-400 hover:text-emerald-600 transition-colors">{link}</a>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="border-t border-slate-100 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <p className="text-xs text-slate-400">&copy; {new Date().getFullYear()} SalaryPilot. All rights reserved.</p>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> SOC 2 Certified</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> 256-bit Encryption</span>
                </div>
            </div>
        </div>
    </footer>
);

/* ─── Landing Page ─── */
export default function LandingPage() {
    return (
        <div className="bg-slate-50 min-h-screen text-slate-700 selection:bg-emerald-500/20 overflow-x-hidden">
            <Navbar />
            <main>
                <Hero />
                <StatsBar />
                <Features />
                <HowItWorks />
                <Testimonials />
                <FinalCTA />
            </main>
            <Footer />
        </div>
    );
}
