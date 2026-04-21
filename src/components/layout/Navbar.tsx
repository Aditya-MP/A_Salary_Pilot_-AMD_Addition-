import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { Link } from 'react-router-dom';

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const { scrollY } = useScroll();

    useMotionValueEvent(scrollY, 'change', (latest) => {
        setScrolled(latest > 30);
    });

    return (
        <motion.nav
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 md:px-12 transition-all duration-500 ${scrolled
                    ? 'backdrop-blur-xl bg-white/80 border-b border-slate-200/60 shadow-sm'
                    : 'bg-transparent border-b border-transparent'
                }`}
        >
            <Link to="/" className="flex items-center gap-2.5 group">
                <motion.div
                    whileHover={{ rotate: 12, scale: 1.1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-500/25"
                >
                    <span className="font-bold text-white text-lg">S</span>
                </motion.div>
                <span className="text-xl font-display font-bold text-navy-900 tracking-tight">
                    Salary<span className="text-emerald-600">Pilot</span>
                </span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
                {['Features', 'Pricing', 'Security', 'Contact'].map((item) => (
                    <a
                        key={item}
                        href={`#${item.toLowerCase()}`}
                        className="relative px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-navy-900 hover:bg-slate-100/80 transition-all duration-300 group"
                    >
                        {item}
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-emerald-500 rounded-full transition-all duration-300 group-hover:w-5" />
                    </a>
                ))}
            </div>

            <div className="flex items-center gap-3">
                <Link to="/login">
                    <Button variant="ghost" size="sm">Log In</Button>
                </Link>
                <Link to="/signup">
                    <Button variant="primary" size="sm" className="hidden sm:inline-flex shadow-md shadow-emerald-500/20">
                        Get Started
                    </Button>
                </Link>
            </div>
        </motion.nav>
    );
}
