/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                navy: {
                    950: '#0b1020',
                    900: '#0f172a',
                    800: '#1e293b',
                    700: '#334155',
                    600: '#475569',
                },
                emerald: {
                    400: '#34d399',
                    500: '#10b981',
                    glow: '#00ff9d',
                },
                purple: {
                    400: '#a78bfa',
                    500: '#7c3aed',
                    600: '#6d28d9',
                    glow: '#a78bfa',
                },
                indigo: {
                    400: '#818cf8',
                    500: '#6366f1',
                    600: '#4f46e5',
                    glow: '#818cf8',
                },
                gold: {
                    400: '#fbbf24',
                    500: '#f59e0b',
                    glow: '#ffd700',
                },
                cyan: {
                    400: '#22d3ee',
                    500: '#06b6d4',
                    glow: '#22d3ee',
                },
                pink: {
                    400: '#f472b6',
                    500: '#ec4899',
                    glow: '#f472b6',
                },
                fuchsia: {
                    500: '#d946ef',
                    glow: '#e879f9',
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
            },
            backgroundImage: {
                'mesh-gradient': 'radial-gradient(at 0% 0%, rgba(124,58,237,0.18) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(6,182,212,0.15) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(236,72,153,0.15) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(99,102,241,0.12) 0px, transparent 50%)',
                'glass-gradient': 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)',
                'glass-dark': 'linear-gradient(180deg, rgba(11, 16, 32, 0.7) 0%, rgba(11, 16, 32, 0.9) 100%)',
                'card-sheen': 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.03) 100%)',
            },
            boxShadow: {
                'glow-sm': '0 0 10px rgba(124, 58, 237, 0.2)',
                'glow-md': '0 0 20px rgba(124, 58, 237, 0.35), 0 0 60px rgba(124, 58, 237, 0.1)',
                'glow-lg': '0 0 30px rgba(124, 58, 237, 0.5), 0 0 80px rgba(124, 58, 237, 0.15)',
                'glow-purple': '0 0 15px rgba(124,58,237,0.25), 0 0 45px rgba(124,58,237,0.1), inset 0 1px 0 rgba(167,139,250,0.1)',
                'glow-cyan': '0 0 15px rgba(6,182,212,0.25), 0 0 45px rgba(6,182,212,0.1), inset 0 1px 0 rgba(34,211,238,0.1)',
                'glow-pink': '0 0 15px rgba(236,72,153,0.25), 0 0 45px rgba(236,72,153,0.1), inset 0 1px 0 rgba(244,114,182,0.1)',
                'glow-emerald': '0 0 15px rgba(16,185,129,0.25), 0 0 45px rgba(16,185,129,0.1), inset 0 1px 0 rgba(52,211,153,0.1)',
                'glow-indigo': '0 0 15px rgba(99,102,241,0.25), 0 0 45px rgba(99,102,241,0.1), inset 0 1px 0 rgba(129,140,248,0.1)',
                'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
                'glass-sm': '0 4px 16px 0 rgba(0, 0, 0, 0.4)',
                'neon-purple': '0 0 8px rgba(124,58,237,0.4), 0 0 24px rgba(124,58,237,0.15)',
                'neon-cyan': '0 0 8px rgba(6,182,212,0.4), 0 0 24px rgba(6,182,212,0.15)',
                'neon-pink': '0 0 8px rgba(236,72,153,0.4), 0 0 24px rgba(236,72,153,0.15)',
            },
            animation: {
                'fade-in-up': 'fadeInUp 0.8s ease-out forwards',
                'float': 'float 6s ease-in-out infinite',
                'float-slow': 'float 10s ease-in-out infinite',
                'float-slower': 'float 14s ease-in-out infinite',
                'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'marquee': 'marquee 25s linear infinite',
                'marquee-reverse': 'marquee-reverse 25s linear infinite',
                'scan': 'scan 4s ease-in-out infinite',
                'blink': 'blink 1s step-end infinite',
                'spin': 'spin 40s linear infinite',
                'glow': 'glow 2s ease-in-out infinite alternate',
                'glow-pulse': 'glowPulse 3s ease-in-out infinite alternate',
                'slide-up': 'slideUp 0.5s ease-out forwards',
                'shimmer': 'shimmer 2s linear infinite',
                'breathe': 'breathe 8s ease-in-out infinite',
                'neon-border': 'neonBorder 4s ease-in-out infinite alternate',
            },
            keyframes: {
                fadeInUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-20px)' },
                },
                marquee: {
                    '0%': { transform: 'translateX(0%)' },
                    '100%': { transform: 'translateX(-100%)' },
                },
                'marquee-reverse': {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(0%)' },
                },
                scan: {
                    '0%, 100%': { opacity: '0.2' },
                    '50%': { opacity: '1' },
                },
                blink: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0' },
                },
                spin: {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                },
                glow: {
                    '0%': { boxShadow: '0 0 5px rgba(124, 58, 237, 0.2)' },
                    '100%': { boxShadow: '0 0 25px rgba(124, 58, 237, 0.5), 0 0 60px rgba(124, 58, 237, 0.15)' },
                },
                glowPulse: {
                    '0%': { boxShadow: '0 0 8px rgba(124,58,237,0.2), 0 0 20px rgba(124,58,237,0.05)' },
                    '100%': { boxShadow: '0 0 20px rgba(124,58,237,0.4), 0 0 60px rgba(124,58,237,0.15), 0 0 100px rgba(124,58,237,0.05)' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(100%)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '-1000px 0' },
                    '100%': { backgroundPosition: '1000px 0' },
                },
                breathe: {
                    '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
                    '50%': { opacity: '0.7', transform: 'scale(1.05)' },
                },
                neonBorder: {
                    '0%': { opacity: '0.5', filter: 'brightness(0.8)' },
                    '100%': { opacity: '1', filter: 'brightness(1.2)' },
                },
            },
        },
    },
    plugins: [],
};
