import { useEffect, useRef } from 'react';
import { useLivePrices } from '../../hooks/useLivePrices';

/* ═══════════════════════════════════════════════════════════════════
   MARKET BACKGROUND

   A living market tape behind the app.

   The important decision: this is NOT decoration. The candles are
   driven by the same live price feed the dashboard reads, so the tape
   drifts green when your holdings are up and red when they are down.
   It is an ambient readout you catch out of the corner of your eye —
   which is the only justification for putting motion behind a screen
   full of numbers.

   Everything that makes background animation go wrong is handled:
   • Contrast is capped. Even at 'vivid' the tape never rises above the
     alpha where 14px text on a card starts to suffer.
   • One canvas, one rAF, linear cost. No per-frame neighbour search.
   • Pauses entirely when the tab is hidden — no battery burn on a
     window nobody is looking at.
   • prefers-reduced-motion renders a single static frame.
   • Device-pixel-ratio aware, so the strokes are crisp on retina.
   ═══════════════════════════════════════════════════════════════════ */

export type Intensity = 'off' | 'subtle' | 'vivid';

const CFG: Record<Exclude<Intensity, 'off'>, {
    candle: number; line: number; fill: number; grid: number;
    glow: number; speed: number; spark: number;
}> = {
    // Visible in the gutters between cards, invisible under text.
    subtle: { candle: 0.11, line: 0.20, fill: 0.05, grid: 0.020, glow: 0, speed: 0.16, spark: 0.16 },
    // Deliberately the loudest this is allowed to get.
    vivid: { candle: 0.30, line: 0.52, fill: 0.14, grid: 0.038, glow: 12, speed: 0.30, spark: 0.42 },
};

interface Candle { o: number; h: number; l: number; c: number }

const SPACING = 13;      // px between candle centres
const BODY = 6;          // candle body width
const HISTORY = 220;     // candles kept in memory

export function MarketBackground({ intensity }: { intensity: Intensity }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const prices = useLivePrices();

    // The rAF loop reads market direction through a ref so it never has
    // to re-subscribe or restart when a price ticks.
    const driftRef = useRef(0);
    useEffect(() => {
        driftRef.current = prices.niftyChange;
    }, [prices.niftyChange]);

    useEffect(() => {
        if (intensity === 'off') return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const cfg = CFG[intensity];
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let w = 0;
        let h = 0;
        let dpr = 1;

        const resize = () => {
            dpr = Math.min(2, window.devicePixelRatio || 1);
            w = canvas.clientWidth;
            h = canvas.clientHeight;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();

        /* ── Seed a plausible price history so the tape looks like it
              has been running since before you opened the app. ── */
        const candles: Candle[] = [];
        let last = 100;
        for (let i = 0; i < HISTORY; i++) {
            const o = last;
            const move = (Math.random() - 0.48) * 2.6;
            const c = o + move;
            candles.push({
                o,
                c,
                h: Math.max(o, c) + Math.random() * 1.3,
                l: Math.min(o, c) - Math.random() * 1.3,
            });
            last = c;
        }

        let offset = 0;
        let raf = 0;
        let running = true;

        const pushCandle = () => {
            const o = candles[candles.length - 1].c;
            // Bias the walk by the live market move. This is the whole
            // point: the tape leans the way the real feed is leaning.
            const bias = driftRef.current * 0.16;
            const move = (Math.random() - 0.5) * 2.4 + bias;
            const c = o + move;
            candles.push({
                o,
                c,
                h: Math.max(o, c) + Math.random() * 1.2,
                l: Math.min(o, c) - Math.random() * 1.2,
            });
            if (candles.length > HISTORY) candles.shift();
        };

        const draw = () => {
            ctx.clearRect(0, 0, w, h);

            const visible = Math.ceil(w / SPACING) + 2;
            const slice = candles.slice(-visible);
            if (slice.length < 2) return;

            let min = Infinity;
            let max = -Infinity;
            for (const k of slice) {
                if (k.l < min) min = k.l;
                if (k.h > max) max = k.h;
            }
            const range = max - min || 1;

            // The tape occupies a band, not the whole screen — content
            // sits above the quiet upper third.
            const bandTop = h * 0.34;
            const bandH = h * 0.52;
            const yOf = (v: number) => bandTop + bandH - ((v - min) / range) * bandH;

            /* ── Faint instrument grid ── */
            ctx.strokeStyle = `rgba(255,255,255,${cfg.grid})`;
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = Math.round(bandTop + (bandH / 4) * i) + 0.5;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            /* ── Candles ── */
            slice.forEach((k, i) => {
                const x = i * SPACING - offset;
                if (x < -SPACING || x > w + SPACING) return;

                const up = k.c >= k.o;
                const rgb = up ? '0,232,134' : '255,77,109';
                // Newer candles are brighter — the eye reads the tape
                // as moving even in a still frame.
                const age = i / slice.length;
                const a = cfg.candle * (0.35 + age * 0.65);

                ctx.strokeStyle = `rgba(${rgb},${a})`;
                ctx.fillStyle = `rgba(${rgb},${a})`;
                ctx.lineWidth = 1;

                ctx.beginPath();
                ctx.moveTo(x + 0.5, yOf(k.h));
                ctx.lineTo(x + 0.5, yOf(k.l));
                ctx.stroke();

                const yo = yOf(k.o);
                const yc = yOf(k.c);
                const top = Math.min(yo, yc);
                const bh = Math.max(1.5, Math.abs(yc - yo));
                ctx.fillRect(x - BODY / 2, top, BODY, bh);
            });

            /* ── Closing line over the top of the candles ── */
            const dir = slice[slice.length - 1].c >= slice[0].c;
            const lineRgb = dir ? '0,232,134' : '255,77,109';

            ctx.beginPath();
            slice.forEach((k, i) => {
                const x = i * SPACING - offset;
                const y = yOf(k.c);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });

            if (cfg.glow > 0) {
                ctx.shadowBlur = cfg.glow;
                ctx.shadowColor = `rgba(${lineRgb},0.5)`;
            }
            ctx.strokeStyle = `rgba(${lineRgb},${cfg.line})`;
            ctx.lineWidth = 1.6;
            ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.shadowBlur = 0;

            /* ── Area fill under the line ── */
            ctx.lineTo(w, h);
            ctx.lineTo(-SPACING, h);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, bandTop, 0, h);
            grad.addColorStop(0, `rgba(${lineRgb},${cfg.fill})`);
            grad.addColorStop(1, `rgba(${lineRgb},0)`);
            ctx.fillStyle = grad;
            ctx.fill();

            /* ── Leading edge marker ── */
            const lead = slice[slice.length - 1];
            const lx = (slice.length - 1) * SPACING - offset;
            const ly = yOf(lead.c);
            ctx.beginPath();
            ctx.arc(lx, ly, 2.4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${lineRgb},${Math.min(1, cfg.line * 2)})`;
            ctx.fill();
            if (cfg.spark > 0.3) {
                ctx.beginPath();
                ctx.arc(lx, ly, 7, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(${lineRgb},${cfg.spark * 0.35})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        };

        const frame = () => {
            if (!running) return;
            offset += cfg.speed;
            if (offset >= SPACING) {
                offset -= SPACING;
                pushCandle();
            }
            draw();
            raf = requestAnimationFrame(frame);
        };

        if (reduce) {
            draw();
        } else {
            raf = requestAnimationFrame(frame);
        }

        // Stop completely when the tab is not visible.
        const onVisibility = () => {
            if (document.hidden) {
                running = false;
                cancelAnimationFrame(raf);
            } else if (!reduce && !running) {
                running = true;
                raf = requestAnimationFrame(frame);
            }
        };

        const onResize = () => {
            resize();
            draw();
        };

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('resize', onResize);

        return () => {
            running = false;
            cancelAnimationFrame(raf);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('resize', onResize);
        };
    }, [intensity]);

    if (intensity === 'off') {
        return <div className="fixed inset-0 -z-10" style={{ background: 'var(--bg-void)' }} aria-hidden />;
    }

    const vivid = intensity === 'vivid';

    return (
        <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
            {/* Base */}
            <div className="absolute inset-0" style={{ background: 'var(--bg-void)' }} />

            {/* Depth — two very slow washes so the flat black has shape */}
            <div
                className="absolute -top-1/4 -left-1/4 w-[900px] h-[900px] rounded-full animate-drift"
                style={{
                    background: `rgba(0,232,134,${vivid ? 0.07 : 0.04})`,
                    filter: 'blur(160px)',
                }}
            />
            <div
                className="absolute top-1/3 -right-1/4 w-[760px] h-[760px] rounded-full"
                style={{
                    background: `rgba(56,189,248,${vivid ? 0.055 : 0.028})`,
                    filter: 'blur(150px)',
                }}
            />

            {/* The live tape */}
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

            {/* Readability guard: darkens the centre where the cards sit,
                so the tape stays a peripheral cue and never competes with
                a number the user is actually trying to read. */}
            <div
                className="absolute inset-0"
                style={{
                    background: vivid
                        ? 'radial-gradient(ellipse 78% 62% at 50% 42%, rgba(6,8,14,0.80) 25%, rgba(6,8,14,0.34) 70%, transparent 100%)'
                        : 'radial-gradient(ellipse 80% 65% at 50% 42%, rgba(6,8,14,0.90) 30%, rgba(6,8,14,0.55) 72%, transparent 100%)',
                }}
            />
        </div>
    );
}
