export type PulseState = "idle" | "staging" | "strike";

export interface PulseData {
    month: number;
    currentMonth: number;
    totalStaged: number;
    stagedCapital: number;
    state: PulseState;
}

export function initializePulse(): PulseData {
    return {
        month: 1,
        currentMonth: 1,
        totalStaged: 0,
        stagedCapital: 0,
        state: "staging",
    };
}

export function advancePulse(
    current: PulseData,
    monthlyStageAmount: number
): PulseData {
    if (current.state === "strike") {
        return initializePulse();
    }

    const newMonth = current.month + 1;
    const newTotal = current.totalStaged + monthlyStageAmount;

    if (newMonth > 3) {
        return {
            month: 3,
            currentMonth: 3,
            totalStaged: newTotal,
            stagedCapital: newTotal,
            state: "strike",
        };
    }

    return {
        month: newMonth,
        currentMonth: newMonth,
        totalStaged: newTotal,
        stagedCapital: newTotal,
        state: "staging",
    };
}
