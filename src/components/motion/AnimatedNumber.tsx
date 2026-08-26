import { useAnimatedValue } from '../../hooks/useAnimatedValue';

/** Renders a number that counts to its value. The easing lives in
    useAnimatedValue so this file exports a component and nothing else. */
export function AnimatedNumber({
    value,
    format,
    duration = 900,
    className,
}: {
    value: number;
    format: (v: number) => string;
    duration?: number;
    className?: string;
}) {
    const shown = useAnimatedValue(value, duration);
    return (
        <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {format(shown)}
        </span>
    );
}
