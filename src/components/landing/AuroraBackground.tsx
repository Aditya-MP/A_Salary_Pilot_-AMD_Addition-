import { useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   AURORA BACKGROUND — the landing page's visual layer.

   Seven layers, composited. Each one is doing a specific job; none of
   them is there to look busy.

     1  Base ink
     2  Aurora  — four large drifting colour fields. The luxury comes
                  from scale and slowness: huge, soft, moving over
                  28-40s. Small fast gradients read as cheap. No blur
                  filter — the gradient ramps are already continuous.
     3  Conic   — a slowly rotating sweep behind the headline, so the
                  centre of the page has a light source.
     4  Grid    — a floor grid in perspective, masked to a horizon.
                  This is the "financial terminal" cue.
     5  Tape    — a live candlestick tape along the bottom edge.
     6  Grain   — fractal noise at low opacity. This is the single
                  biggest difference between gradients that look
                  expensive and gradients that look like a CSS demo:
                  it destroys the banding that large soft fields always
                  produce on 8-bit displays. Plain opacity, not
                  mix-blend-mode — blending forces the whole stack
                  beneath to recomposite every frame.
     7  Spotlight — follows the cursor, brightens what it passes over.

   Performance: the whole stack is promoted to one compositing layer
   and contained, so page scroll never re-composites it against the
   content above. Layers 2, 4 and 6 are filter-free CSS. Only the tape
   uses a canvas, and it avoids shadowBlur. The spotlight writes two CSS
   custom properties from a rAF loop — no React state, so moving the
   mouse never re-renders the page.
   ═══════════════════════════════════════════════════════════════════ */

/* Fractal noise, inlined so it costs no request. */
const GRAIN =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

export function AuroraBackground() {
    const rootRef = useRef<HTMLDivElement>(null);
    const tapeRef = useRef<HTMLCanvasElement>(null);

    /* ─── Cursor spotlight ─── */
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        if (window.matchMedia('(pointer: coarse)').matches) return;

        let raf = 0;
        let x = window.innerWidth / 2;
        let y = window.innerHeight * 0.35;
        let tx = x;
        let ty = y;

        const onMove = (e: PointerEvent) => {
            tx = e.clientX;
            ty = e.clientY;
        };

        const loop = () => {
            // Ease toward the pointer so the light has weight rather
            // than snapping — the difference between premium and twitchy.
            x += (tx - x) * 0.06;
            y += (ty - y) * 0.06;
            root.style.setProperty('--mx', `${x}px`);
            root.style.setProperty('--my', `${y}px`);
            raf = requestAnimationFrame(loop);
        };

        window.addEventListener('pointermove', onMove, { passive: true });
        raf = requestAnimationFrame(loop);
        return () => {
            window.removeEventListener('pointermove', onMove);
            cancelAnimationFrame(raf);
        };
    }, []);

    /* ─── Live tape along the bottom ─── */
    useEffect(() => {
        const canvas = tapeRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let w = 0;
        let h = 0;
        const resize = () => {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            w = canvas.clientWidth;
            h = canvas.clientHeight;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();

        const SPACING = 15;
        const series: { o: number; c: number; h: number; l: number }[] = [];
        let last = 100;
        for (let i = 0; i < 300; i++) {
            const o = last;
            const c = o + (Math.random() - 0.46) * 2.4;
            series.push({
                o,
                c,
                h: Math.max(o, c) + Math.random() * 1.1,
                l: Math.min(o, c) - Math.random() * 1.1,
            });
            last = c;
        }

        let offset = 0;
        let raf = 0;
        let alive = true;

        const draw = () => {
            ctx.clearRect(0, 0, w, h);
            const count = Math.ceil(w / SPACING) + 2;
            const slice = series.slice(-count);

            let min = Infinity;
            let max = -Infinity;
            for (const k of slice) {
                if (k.l < min) min = k.l;
                if (k.h > max) max = k.h;
            }
            const range = max - min || 1;
            const pad = h * 0.18;
            const yOf = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);

            slice.forEach((k, i) => {
                const x = i * SPACING - offset;
                if (x < -SPACING || x > w + SPACING) return;
                const up = k.c >= k.o;
                const rgb = up ? '0,232,134' : '255,77,109';
                const a = 0.30 * (0.25 + (i / slice.length) * 0.75);

                ctx.strokeStyle = `rgba(${rgb},${a})`;
                ctx.fillStyle = `rgba(${rgb},${a})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + 0.5, yOf(k.h));
                ctx.lineTo(x + 0.5, yOf(k.l));
                ctx.stroke();

                const yo = yOf(k.o);
                const yc = yOf(k.c);
                ctx.fillRect(x - 3, Math.min(yo, yc), 6, Math.max(1.5, Math.abs(yc - yo)));
            });

            // Closing line, glowing
            ctx.beginPath();
            slice.forEach((k, i) => {
                const x = i * SPACING - offset;
                const y = yOf(k.c);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            // Wide, faint pass = the bloom.
            ctx.strokeStyle = 'rgba(0,232,134,0.10)';
            ctx.lineWidth = 7;
            ctx.stroke();
            // Narrow, bright pass = the line itself.
            ctx.strokeStyle = 'rgba(0,232,134,0.55)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
        };

        const step = () => {
            if (!alive) return;
            offset += 0.32;
            if (offset >= SPACING) {
                offset -= SPACING;
                const o = series[series.length - 1].c;
                const c = o + (Math.random() - 0.46) * 2.4;
                series.push({
                    o,
                    c,
                    h: Math.max(o, c) + Math.random() * 1.1,
                    l: Math.min(o, c) - Math.random() * 1.1,
                });
                if (series.length > 300) series.shift();
            }
            draw();
            raf = requestAnimationFrame(step);
        };

        if (reduce) draw();
        else raf = requestAnimationFrame(step);

        const onVis = () => {
            if (document.hidden) {
                alive = false;
                cancelAnimationFrame(raf);
            } else if (!reduce && !alive) {
                alive = true;
                raf = requestAnimationFrame(step);
            }
        };
        const onResize = () => {
            resize();
            draw();
        };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('resize', onResize);
        return () => {
            alive = false;
            cancelAnimationFrame(raf);
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('resize', onResize);
        };
    }, []);

    return (
        <div
            ref={rootRef}
            className="fixed inset-0 -z-10 overflow-hidden"
            style={{
                ['--mx' as string]: '50vw',
                ['--my' as string]: '35vh',
                transform: 'translateZ(0)',
                isolation: 'isolate',
                contain: 'layout paint style',
            }}
            aria-hidden
        >
            {/* 1 · Base */}
            <div className="absolute inset-0" style={{ background: '#04070d' }} />

            {/* 2 · Aurora.

                No `filter: blur()` here, deliberately. These were blurred
                at 90-110px, which was pure waste: a radial-gradient with
                a soft alpha ramp is ALREADY continuous, so the blur pass
                cost a full-screen convolution per element per frame and
                changed almost nothing on screen. The multi-stop ramps
                below approximate a gaussian falloff directly in the
                gradient, which the GPU draws for free. This was the
                single largest cause of the scroll stutter. */}
            <div
                className="absolute rounded-full aurora-a"
                style={{
                    width: '78vw', height: '78vw', top: '-32vw', left: '-16vw',
                    background:
                        'radial-gradient(circle, rgba(0,232,134,0.32) 0%, rgba(0,232,134,0.17) 30%, rgba(0,232,134,0.05) 55%, rgba(0,232,134,0) 74%)',
                }}
            />
            <div
                className="absolute rounded-full aurora-b"
                style={{
                    width: '68vw', height: '68vw', top: '-14vw', right: '-20vw',
                    background:
                        'radial-gradient(circle, rgba(56,189,248,0.28) 0%, rgba(56,189,248,0.14) 30%, rgba(56,189,248,0.04) 55%, rgba(56,189,248,0) 74%)',
                }}
            />
            <div
                className="absolute rounded-full aurora-c"
                style={{
                    width: '62vw', height: '62vw', top: '24vh', left: '18vw',
                    background:
                        'radial-gradient(circle, rgba(167,139,250,0.24) 0%, rgba(167,139,250,0.12) 30%, rgba(167,139,250,0.035) 55%, rgba(167,139,250,0) 74%)',
                }}
            />
            <div
                className="absolute rounded-full aurora-d"
                style={{
                    width: '52vw', height: '52vw', top: '52vh', right: '4vw',
                    background:
                        'radial-gradient(circle, rgba(94,234,212,0.22) 0%, rgba(94,234,212,0.11) 30%, rgba(94,234,212,0.03) 55%, rgba(94,234,212,0) 74%)',
                }}
            />

            {/* 3 · Rotating conic sweep — the light source behind the hero */}
            <div
                className="absolute conic-sweep"
                style={{
                    width: '104vw', height: '104vw', top: '-40vw', left: '-2vw',
                    background:
                        'conic-gradient(from 0deg, transparent 0%, rgba(0,232,134,0.10) 12%, transparent 26%, rgba(56,189,248,0.09) 46%, transparent 62%, rgba(167,139,250,0.08) 80%, transparent 100%)',
                    filter: 'blur(34px)',
                    borderRadius: '50%',
                }}
            />

            {/* 4 · Perspective floor grid */}
            <div
                className="absolute inset-x-0 bottom-0 h-[62vh]"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(0,232,134,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(0,232,134,0.16) 1px, transparent 1px)',
                    backgroundSize: '64px 64px',
                    transform: 'perspective(340px) rotateX(58deg)',
                    transformOrigin: 'bottom center',
                    maskImage: 'linear-gradient(to top, #000 0%, transparent 82%)',
                    WebkitMaskImage: 'linear-gradient(to top, #000 0%, transparent 82%)',
                    opacity: 0.5,
                }}
            />

            {/* 5 · Live market tape */}
            <canvas
                ref={tapeRef}
                className="absolute inset-x-0 bottom-0 w-full h-[26vh]"
                style={{
                    maskImage: 'linear-gradient(to top, #000 30%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to top, #000 30%, transparent 100%)',
                    opacity: 0.75,
                }}
            />

            {/* 7 · Cursor spotlight (above the fields, below the grain) */}
            <div
                className="absolute inset-0"
                style={{
                    background:
                        'radial-gradient(620px circle at var(--mx) var(--my), rgba(255,255,255,0.055), rgba(0,232,134,0.035) 32%, transparent 62%)',
                }}
            />

            {/* Vignette — pulls the eye to the centre */}
            <div
                className="absolute inset-0"
                style={{
                    background:
                        'radial-gradient(ellipse 90% 75% at 50% 40%, transparent 30%, rgba(4,7,13,0.55) 72%, rgba(4,7,13,0.92) 100%)',
                }}
            />

            {/* 6 · Grain, on top of everything. Kills gradient banding. */}
            <div
                className="absolute inset-0"
                style={{ backgroundImage: GRAIN, opacity: 0.09 }}
            />
        </div>
    );
}
