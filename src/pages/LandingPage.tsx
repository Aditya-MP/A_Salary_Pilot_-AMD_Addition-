import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';
import Navbar from '../components/layout/Navbar';
import { Button } from '../components/ui/Button';
import { Link } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { AuroraBackground } from '../components/landing/AuroraBackground';
import { Shield, Zap, Brain, Lock, ArrowRight, Star, Users, Coins, Award, BarChart3 } from 'lucide-react';

/* ─── Animated Counter ─── */
/* setInterval at 16ms fired ~125 React state updates per counter over
   two seconds. Four of these sit in the stats bar and all start the
   instant it scrolls into view — roughly 500 renders during the exact
   moment the user is scrolling past them, which is precisely when the
   main thread can least afford it. One rAF loop, eased, and it stops
   on the frame it lands. */
function AnimatedCounter({ target, suffix = '', prefix = '' }: { target: number; suffix?: string; prefix?: string }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-60px' });
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!isInView) return;
        let raf = 0;
        const start = performance.now();
        const duration = 1600;

        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setCount(Math.round(target * eased));
            if (t < 1) raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [isInView, target]);

    return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

/* ─── Hero ───────────────────────────────────────────────────────────
   The scroll stutter here had four compounding causes, all of them
   about compositing rather than JavaScript:

   1. `rotateX` driven by a mouse spring, on the element containing all
      the hero text. A 3D rotation forces the browser to re-rasterise
      every glyph in the subtree, and the spring meant that happened on
      every pointer move — continuously, even when idle. Removed.

   2. `perspective` was set on the transformed element itself. It
      belongs on the parent; on the element it buys nothing and still
      builds a 3D rendering context. Removed.

   3. `scale` on the same subtree. Scaling text re-rasterises it too.
      Translate and opacity are the only two properties that animate
      for free, so those are the two that survived.

   4. backdrop-filter on the badge and the secondary CTA, INSIDE that
      animated layer, sitting over four animated aurora fields. Every
      frame the browser had to recompute the blur of everything behind
      them. Replaced with flat translucency.
   ─────────────────────────────────────────────────────────────────── */
const Hero = () => {
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
    const y = useTransform(scrollYProgress, [0, 1], ['0%', '32%']);
    const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

    return (
        <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden">

            <motion.div
                style={{ y, opacity, willChange: 'transform, opacity' }}
                className="relative z-10 container mx-auto px-6 text-center pt-20"
            >
                {/* Badge */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.85, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="inline-flex items-center gap-2.5 mb-6 px-5 py-2 rounded-full border border-[var(--line)] shadow-sm" style={{ background: 'rgba(10,13,22,0.86)' }}
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-hi)] opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)]" />
                    </span>
                    <span className="text-accent text-xs font-semibold tracking-wider uppercase">AI-Powered Wealth Management</span>
                </motion.div>

                {/* Headline */}
                <motion.h1
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                    className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-bold mb-6 tracking-tight leading-[1.05] text-hi"
                >
                    <span className="block">Smarter Finance.</span>
                    <span className="block mt-1 text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] via-teal-500 to-cyan-500 pb-2">
                        Effortless Control.
                    </span>
                </motion.h1>

                {/* Subheadline */}
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.15, ease: 'easeOut' }}
                    className="text-lg md:text-xl text-lo max-w-2xl mx-auto mb-10 leading-relaxed"
                >
                    Experience <span className="text-hi font-medium">next-generation</span> wealth management with real-time AI insights,
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
                        <Button size="lg" className="group relative overflow-hidden bg-[var(--accent)] hover:bg-[var(--accent-hi)] text-[var(--accent-ink)] font-bold px-10 py-4 shadow-2 transition-all duration-300 hover:scale-[1.03] border-0 rounded-2xl shimmer">
                            <span className="relative z-10 flex items-center gap-2">
                                Get Started Free
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </span>
                        </Button>
                    </Link>
                    <Button variant="outline" size="lg" className="group px-10 py-4 rounded-2xl border border-[var(--line)] hover:border-[var(--line-strong)]" style={{ background: 'rgba(12,16,26,0.72)' }}>
                        <span className="text-lo font-medium group-hover:text-hi transition-colors flex items-center gap-2">
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
                    className="flex flex-wrap items-center justify-center gap-6 text-xs text-faint"
                >
                    <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Bank-grade encryption</span>
                    <span className="hidden sm:block w-1 h-1 rounded-full bg-[var(--surface-3)]" />
                    <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> SEBI compliant</span>
                    <span className="hidden sm:block w-1 h-1 rounded-full bg-[var(--surface-3)]" />
                    <span className="flex items-center gap-1.5">
                        <div className="flex -space-x-1">
                            {[...Array(5)].map((_, i) => <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />)}
                        </div>
                        4.9/5 Rating
                    </span>
                </motion.div>
            </motion.div>

        </section>
    );
};

/* ─── Stats Bar ─── */
const StatsBar = () => (
    <section className="relative py-16 border-y border-[var(--line-subtle)]">
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
                        <stat.icon className="w-5 h-5 text-accent mx-auto mb-2 group-hover:scale-110 transition-transform" />
                        <p className="text-3xl md:text-4xl font-bold text-hi stat-highlight inline-block">
                            <AnimatedCounter target={stat.value} suffix={stat.suffix} prefix={stat.prefix || ''} />
                        </p>
                        <p className="text-sm text-faint mt-1">{stat.label}</p>
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
        <section className="py-28 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[var(--line)] to-transparent" />
                <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[var(--line)] to-transparent" />
            </div>

            <div className="container mx-auto px-6 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    className="text-center mb-20"
                >
                    <span className="inline-block text-accent text-xs font-bold tracking-widest uppercase mb-3 px-3 py-1 rounded-full bg-[var(--gain-dim)] border border-[rgba(0,232,134,0.22)]">
                        Core Features
                    </span>
                    <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-hi mb-5 tracking-tight">
                        Institutional-Grade Power
                    </h2>
                    <p className="text-lo text-lg max-w-2xl mx-auto">
                        Built for serious investors who demand precision, speed, and intelligence.
                    </p>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
                    {features.map((feature, i) => (
                        <GlassCard key={i} delay={i * 0.12} className="p-8 group">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--accent-hi)] to-[var(--accent)] flex items-center justify-center mb-6 border border-[rgba(0,232,134,0.22)] shadow-sm  transition-all duration-300">
                                <span className="text-3xl">{feature.emoji}</span>
                            </div>
                            <h3 className="text-xl font-display font-bold text-hi mb-3">{feature.title}</h3>
                            <p className="text-lo leading-relaxed text-sm mb-5">
                                {feature.description}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {feature.highlights.map((h) => (
                                    <span key={h} className="text-xs font-medium text-accent bg-[var(--gain-dim)] border border-[rgba(0,232,134,0.22)] rounded-full px-3 py-1">
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
        <section className="py-28 relative overflow-hidden">
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
                    <h2 className="text-4xl md:text-5xl font-display font-bold text-hi mb-5 tracking-tight">
                        Three Simple Steps
                    </h2>
                    <p className="text-lo text-lg max-w-2xl mx-auto">
                        Get started in under 2 minutes. No paperwork, no complexity.
                    </p>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-8 relative">
                    {/* Connector line */}
                    <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px bg-gradient-to-r from-[var(--accent)] via-blue-200 to-purple-200" />

                    {steps.map((s, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: i * 0.15 }}
                            className="relative text-center group"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--info)] flex items-center justify-center mx-auto mb-6 text-[var(--accent-ink)] font-bold text-sm shadow-2 group-hover:scale-110 transition-transform">
                                {s.step}
                            </div>
                            <h3 className="text-lg font-bold text-hi mb-2">{s.title}</h3>
                            <p className="text-lo text-sm leading-relaxed max-w-xs mx-auto">{s.desc}</p>
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
        <section className="py-28 relative overflow-hidden">
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
                    <h2 className="text-4xl md:text-5xl font-display font-bold text-hi mb-5 tracking-tight">
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
                            className="glass p-6 shadow-2 hover:border-[var(--line-strong)] transition-all duration-300 hover:-translate-y-1"
                        >
                            <div className="flex items-center gap-1 mb-4">
                                {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
                            </div>
                            <p className="text-lo text-sm leading-relaxed mb-5">"{t.text}"</p>
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{t.avatar}</span>
                                <div>
                                    <p className="text-hi font-semibold text-sm">{t.name}</p>
                                    <p className="text-faint text-xs">{t.role}</p>
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
    <section className="py-28 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-30">
            <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full bg-[var(--gain-dim)] blur-[100px]" />
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
                <h2 className="text-4xl md:text-5xl font-display font-bold text-hi mb-5 tracking-tight">
                    Ready to Take Control of <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-[var(--info)]">Your Financial Future?</span>
                </h2>
                <p className="text-lo text-lg mb-10 max-w-xl mx-auto">
                    Join 50,000+ professionals who trust SalaryPilot to grow their wealth intelligently.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link to="/signup">
                        <Button size="lg" className="bg-[var(--accent)] hover:bg-[var(--accent-hi)] text-[var(--accent-ink)] font-bold px-12 py-4 shadow-3 rounded-2xl shimmer border-0">
                            <span className="relative z-10 flex items-center gap-2">
                                Start Free Today <ArrowRight className="w-5 h-5" />
                            </span>
                        </Button>
                    </Link>
                    <p className="text-xs text-faint">No credit card required • Free forever tier</p>
                </div>
            </motion.div>
        </div>
    </section>
);

/* ─── Footer ─── */
const Footer = () => (
    <footer className="relative border-t border-[var(--line-subtle)] pt-16 pb-8" style={{ background: 'rgba(6,9,15,0.72)', backdropFilter: 'blur(8px)' }}>
        <div className="container mx-auto px-6">
            <div className="grid md:grid-cols-4 gap-10 mb-12">
                <div className="md:col-span-1">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[var(--accent)] to-[var(--info)] flex items-center justify-center shadow-1">
                            <span className="font-bold text-[var(--accent-ink)] text-lg">S</span>
                        </div>
                        <span className="text-xl font-display font-bold text-hi">
                            Salary<span className="text-accent">Pilot</span>
                        </span>
                    </div>
                    <p className="text-sm text-faint leading-relaxed">
                        AI-powered wealth management for the modern professional.
                    </p>
                </div>

                {[
                    { title: 'Product', links: ['Features', 'Pricing', 'Security', 'Roadmap'] },
                    { title: 'Company', links: ['About', 'Careers', 'Blog', 'Press'] },
                    { title: 'Legal', links: ['Privacy', 'Terms', 'Compliance', 'Contact'] },
                ].map((col) => (
                    <div key={col.title}>
                        <p className="text-sm font-semibold text-hi mb-3">{col.title}</p>
                        <div className="space-y-2">
                            {col.links.map((link) => (
                                <a key={link} href="#" className="block text-sm text-faint hover:text-accent transition-colors">{link}</a>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="border-t border-[var(--line-subtle)] pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <p className="text-xs text-faint">&copy; {new Date().getFullYear()} SalaryPilot. All rights reserved.</p>
                <div className="flex items-center gap-4 text-xs text-faint">
                    <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> SOC 2 Certified</span>
                    <span className="w-1 h-1 rounded-full bg-[var(--surface-3)]" />
                    <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> 256-bit Encryption</span>
                </div>
            </div>
        </div>
    </footer>
);

/* ─── Landing Page ─── */
export default function LandingPage() {
    return (
        <div className="relative min-h-screen text-mid selection:bg-[var(--accent)]/20 overflow-x-hidden">
            {/* One continuous background for the whole page, rather than
                each section painting its own flat grey slab. */}
            <AuroraBackground />
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
