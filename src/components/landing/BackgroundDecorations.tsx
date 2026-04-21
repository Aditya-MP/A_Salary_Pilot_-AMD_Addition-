import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

// Random data generator for charts
const generateChartData = (points: number) => {
    return Array.from({ length: points }, (_, i) => ({
        id: i,
        height: Math.random() * 100,
        color: Math.random() > 0.5 ? '#10b981' : '#34d399' // Emerald shades
    }));
};

const FloatingTicker = ({ initialX, initialY, duration, delay, text }: { initialX: number, initialY: number, duration: number, delay: number, text: string }) => (
    <motion.div
        initial={{ x: initialX, y: initialY, opacity: 0 }}
        animate={{
            y: [initialY, initialY - 100],
            opacity: [0, 0.4, 0]
        }}
        transition={{
            duration: duration,
            repeat: Infinity,
            delay: delay,
            ease: "linear"
        }}
        className="absolute text-xs font-mono text-emerald-500/30 whitespace-nowrap pointer-events-none select-none"
    >
        {text}
    </motion.div>
);

const CandlestickChart = ({ delay }: { delay: number }) => {
    const bars = generateChartData(15);

    return (
        <div className="flex items-end gap-1 h-32 opacity-20 transform -skew-x-12">
            {bars.map((bar, i) => (
                <motion.div
                    key={bar.id}
                    initial={{ height: '0%' }}
                    animate={{
                        height: [`${bar.height}%`, `${Math.random() * 100}%`, `${bar.height}%`]
                    }}
                    transition={{
                        duration: 3,
                        repeat: Infinity,
                        repeatType: "reverse",
                        delay: delay + (i * 0.1),
                        ease: "easeInOut"
                    }}
                    style={{ backgroundColor: bar.color }}
                    className="w-2 rounded-t-sm"
                />
            ))}
        </div>
    );
};

const BackgroundDecorations = () => {
    const [points, setPoints] = useState<any[]>([]);

    useEffect(() => {
        // Hydration fix: only render random positions on client
        setPoints([
            { x: 100, y: 200, text: "AAPL +2.4%", d: 15, delay: 0 },
            { x: window.innerWidth - 200, y: 400, text: "BTC +5.2%", d: 18, delay: 5 },
            { x: window.innerWidth / 2 + 100, y: 300, text: "NVDA +1.8%", d: 20, delay: 2 },
            { x: window.innerWidth / 4, y: 600, text: "SPX +0.45%", d: 25, delay: 8 },
            { x: window.innerWidth * 0.8, y: 150, text: "TSLA -0.2%", d: 22, delay: 1 }
        ]);
    }, []);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {/* 1. Abstract Candlestick Charts */}
            <div className="absolute top-1/4 left-[10%] opacity-30">
                <CandlestickChart delay={0} />
            </div>
            <div className="absolute bottom-1/3 right-[5%] opacity-20 scale-150">
                <CandlestickChart delay={2} />
            </div>

            {/* 2. Floating Tickers/Numbers */}
            {points.map((p, i) => (
                <FloatingTicker key={i} initialX={p.x} initialY={p.y} duration={p.d} delay={p.delay} text={p.text} />
            ))}

            {/* 3. Glowing Orbital Lines (SVG) */}
            <svg className="absolute inset-0 w-full h-full opacity-20" style={{ zIndex: 0 }}>
                <defs>
                    <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="transparent" />
                        <stop offset="50%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                    <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="transparent" />
                        <stop offset="50%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                </defs>
                <motion.path
                    d="M0,500 Q400,300 800,500 T1600,500"
                    fill="none"
                    stroke="url(#gradient1)"
                    strokeWidth="2"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.5 }}
                    transition={{ duration: 5, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
                />
                <motion.path
                    d="M-100,600 Q500,800 1200,400 T2000,600"
                    fill="none"
                    stroke="url(#gradient2)"
                    strokeWidth="1"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.3 }}
                    transition={{ duration: 8, repeat: Infinity, repeatType: "mirror", ease: "linear", delay: 1 }}
                />
            </svg>
        </div>
    );
};

export default BackgroundDecorations;
