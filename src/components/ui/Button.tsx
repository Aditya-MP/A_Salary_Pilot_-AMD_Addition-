import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/cn';

/* The previous variants were built for a light theme — `bg-white`,
   `border-slate-200`, `text-emerald-600`, `focus:ring-offset-white` —
   on an app with a near-black background. That mismatch was a large
   part of why surfaces looked washed out. Rebuilt on the tokens. */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
}

type MotionButtonProps = ButtonProps & HTMLMotionProps<'button'>;

const Button = forwardRef<HTMLButtonElement, MotionButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
        const variants: Record<string, string> = {
            primary: 'btn-primary',
            secondary: 'btn-secondary',
            ghost: 'btn-ghost',
            outline: 'btn-secondary bg-transparent',
        };

        const sizes: Record<string, string> = {
            sm: 'h-9 px-4 text-[12.5px]',
            md: 'h-11 px-6 text-[13.5px]',
            lg: 'h-13 px-8 text-[15px]',
        };

        return (
            <motion.button
                ref={ref}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className={cn('btn relative', variants[variant], sizes[size], className)}
                {...props}
            >
                {isLoading && (
                    <span className="absolute inset-0 grid place-items-center">
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    </span>
                )}
                <span className={cn('flex items-center gap-2', isLoading && 'opacity-0')}>
                    {children}
                </span>
            </motion.button>
        );
    }
);

Button.displayName = 'Button';

export { Button };
