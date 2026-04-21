import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'glass' | 'outline';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    isLoading?: boolean;
}

type MotionButtonProps = ButtonProps & HTMLMotionProps<"button">;

const Button = forwardRef<HTMLButtonElement, MotionButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {

        const variants = {
            primary: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 hover:shadow-emerald-500/30 border-0',
            secondary: 'bg-white border border-slate-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 shadow-sm',
            ghost: 'bg-transparent text-slate-600 hover:text-navy-900 hover:bg-slate-100',
            glass: 'bg-white/60 backdrop-blur-md border border-slate-200/50 text-navy-900 hover:bg-white/80 shadow-sm',
            outline: 'bg-transparent border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300',
        };

        const sizes = {
            sm: 'h-9 px-4 text-sm',
            md: 'h-11 px-6 text-base',
            lg: 'h-14 px-8 text-lg',
            xl: 'h-16 px-10 text-xl',
        };

        return (
            <motion.button
                ref={ref}
                whileHover={{ scale: 1.02, translateY: -1 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    'relative inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:pointer-events-none overflow-hidden',
                    variants[variant as keyof typeof variants],
                    sizes[size as keyof typeof sizes],
                    className
                )}
                {...props}
            >
                {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : null}
                <span className={cn("flex items-center gap-2", isLoading && "opacity-0")}>
                    {children}
                </span>

                {variant === 'primary' && (
                    <div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 transition-opacity duration-300 hover:opacity-100" />
                )}
            </motion.button>
        );
    }
);

Button.displayName = 'Button';

export { Button, cn };
