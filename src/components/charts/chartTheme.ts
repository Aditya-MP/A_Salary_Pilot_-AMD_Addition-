/* ═══════════════════════════════════════════════════════════════════
   Shared Recharts styling.

   Previously each page redeclared its own tooltip object, axis colours
   and grid stroke inline, so no two charts matched. Everything chart-
   related now comes from here.

   Principles applied:
   • Gridlines are barely visible — they orient, they don't compete
     with the data. Horizontal only; vertical gridlines on a time axis
     are noise.
   • Axes have no line and no ticks. The numbers are the axis.
   • Series colours come from the tokens, so charts stay in step with
     the rest of the palette automatically.
   ═══════════════════════════════════════════════════════════════════ */

export const AXIS = {
    stroke: 'transparent',
    tick: { fill: 'var(--text-faint)', fontSize: 10.5 },
    tickLine: false,
    axisLine: false,
} as const;

export const GRID = {
    stroke: 'rgba(255,255,255,0.05)',
    strokeDasharray: '0',
    vertical: false,
} as const;

export const TOOLTIP = {
    contentStyle: {
        background: 'var(--surface-2)',
        border: '1px solid var(--line-strong)',
        borderRadius: 'var(--r-md)',
        boxShadow: 'var(--shadow-3)',
        fontSize: '12px',
        padding: '10px 12px',
    },
    labelStyle: {
        color: 'var(--text-faint)',
        fontSize: '10.5px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        marginBottom: 4,
        fontWeight: 600,
    },
    itemStyle: { color: 'var(--text-hi)', fontSize: '12px', padding: 0 },
    cursor: { fill: 'rgba(255,255,255,0.04)' },
} as const;

/** Categorical series palette — distinct in hue and lightness. */
export const SERIES = [
    'var(--series-1)',
    'var(--series-2)',
    'var(--series-3)',
    'var(--series-4)',
    'var(--series-5)',
    'var(--series-6)',
];

/** Semantic colours — use these whenever the value has a direction. */
export const GAIN = 'var(--gain)';
export const LOSS = 'var(--loss)';
export const WARN = 'var(--warn)';
export const INFO = 'var(--info)';

export function directional(v: number): string {
    return v >= 0 ? GAIN : LOSS;
}
