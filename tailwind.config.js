/** @type {import('tailwindcss').Config} */

/* Tailwind is deliberately thin here. The palette lives in
   src/design/tokens.css as CSS custom properties; this file only
   exposes them to utility classes so there is exactly ONE source
   of truth for colour. */

export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                void: 'var(--bg-void)',
                base: 'var(--bg-base)',
                s1: 'var(--surface-1)',
                s2: 'var(--surface-2)',
                s3: 'var(--surface-3)',

                line: {
                    subtle: 'var(--line-subtle)',
                    DEFAULT: 'var(--line)',
                    strong: 'var(--line-strong)',
                },

                ink: {
                    hi: 'var(--text-hi)',
                    DEFAULT: 'var(--text)',
                    lo: 'var(--text-lo)',
                    faint: 'var(--text-faint)',
                },

                accent: {
                    DEFAULT: 'var(--accent)',
                    hi: 'var(--accent-hi)',
                    lo: 'var(--accent-lo)',
                    ink: 'var(--accent-ink)',
                },

                gain: 'var(--gain)',
                loss: 'var(--loss)',
                warn: 'var(--warn)',
                info: 'var(--info)',

                series: {
                    1: 'var(--series-1)',
                    2: 'var(--series-2)',
                    3: 'var(--series-3)',
                    4: 'var(--series-4)',
                    5: 'var(--series-5)',
                    6: 'var(--series-6)',
                },
            },

            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
            },

            borderRadius: {
                sm: 'var(--r-sm)',
                md: 'var(--r-md)',
                lg: 'var(--r-lg)',
                xl: 'var(--r-xl)',
            },

            boxShadow: {
                1: 'var(--shadow-1)',
                2: 'var(--shadow-2)',
                3: 'var(--shadow-3)',
                glow: 'var(--glow-accent)',
            },

            transitionTimingFunction: {
                smooth: 'cubic-bezier(0.32, 0.72, 0, 1)',
                out: 'cubic-bezier(0.16, 1, 0.3, 1)',
            },

            maxWidth: {
                page: 'var(--page-max)',
            },
        },
    },
    plugins: [],
};
