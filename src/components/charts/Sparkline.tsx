import { useId } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   Inline sparkline — hand-drawn SVG rather than a Recharts instance.

   A Recharts <ResponsiveContainer> per row is genuinely expensive; a
   holdings table with 13 rows would mount 13 chart runtimes and each
   one installs a resize observer. This draws one path, costs nothing,
   and is the right tool for a 60×20 trend cue.
   ═══════════════════════════════════════════════════════════════════ */

export function Sparkline({
    data,
    width = 72,
    height = 22,
    color,
    fill = true,
}: {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    fill?: boolean;
}) {
    const id = useId();
    if (data.length < 2) return <div style={{ width, height }} aria-hidden />;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const pad = 2;
    const h = height - pad * 2;

    const pts = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = pad + h - ((v - min) / span) * h;
        return [x, y] as const;
    });

    // Smooth the line with a simple midpoint quadratic — a raw polyline
    // on noisy price data looks jagged and cheap at this size.
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
        const [px, py] = pts[i - 1];
        const [cx, cy] = pts[i];
        d += ` Q ${px},${py} ${(px + cx) / 2},${(py + cy) / 2}`;
    }
    d += ` L ${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}`;

    const rising = data[data.length - 1] >= data[0];
    const stroke = color ?? (rising ? 'var(--gain)' : 'var(--loss)');

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Trend ${rising ? 'up' : 'down'}`}
            style={{ overflow: 'visible' }}
        >
            {fill && (
                <>
                    <defs>
                        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
                            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <path
                        d={`${d} L ${width},${height} L 0,${height} Z`}
                        fill={`url(#sp-${id})`}
                    />
                </>
            )}
            <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={stroke} />
        </svg>
    );
}

