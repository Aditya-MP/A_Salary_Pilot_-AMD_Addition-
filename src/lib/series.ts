/** Deterministic pseudo price-history, so a sparkline for a given
    ticker looks the same on every render instead of reshuffling on
    each live-price tick. */
export function syntheticSeries(seed: string, points = 24, drift = 0): number[] {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;

    const out: number[] = [];
    let v = 100;
    for (let i = 0; i < points; i++) {
        h = (h * 1664525 + 1013904223) >>> 0;
        const noise = ((h >>> 16) / 65535 - 0.5) * 4;
        v = v + noise + drift / points;
        out.push(v);
    }
    return out;
}
