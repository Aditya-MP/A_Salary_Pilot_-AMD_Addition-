import { useEffect, useRef } from 'react';
import auraLightImage from '../../assets/aura_light_chart_art.png';

const UltraBackground = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        const particles: Particle[] = [];
        const particleCount = 30;

        class Particle {
            x: number;
            y: number;
            speedY: number;
            size: number;
            color: string;
            alpha: number;

            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.speedY = Math.random() * 0.5 + 0.1;
                this.size = Math.random() * 3;
                this.alpha = Math.random() * 0.5 + 0.2;
                // Gold and Emerald particles for "Aura"
                this.color = Math.random() > 0.5 ? '234, 179, 8' : '16, 185, 129';
            }

            update() {
                this.y -= this.speedY; // Float up
                if (this.y < -10) this.y = height + 10;
            }

            draw() {
                if (!ctx) return;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${this.color}, ${this.alpha})`;
                ctx.fill();
            }
        }

        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }

        const animate = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, width, height);

            particles.forEach(p => {
                p.update();
                p.draw();
            });

            requestAnimationFrame(animate);
        };

        animate();

        const handleResize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-0 bg-slate-50">
            {/* Main Background Image - Light Mode - "Aura" effect */}
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-75"
                style={{
                    backgroundImage: `url(${auraLightImage})`,
                    filter: 'brightness(1.05) contrast(1.05) saturate(0.9)'
                }}
            />

            {/* White Overlay for Text Clarity */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/20 to-slate-50/90" />

            {/* Canvas Overlay for Golden/Emerald Aura Particles */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full mix-blend-multiply opacity-40"
            />
        </div>
    );
};

export default UltraBackground;
