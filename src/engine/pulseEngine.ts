export type PulseState = "idle" | "staging" | "strike";

export interface PulseData {
    month: number;
    currentMonth: number;
    totalStaged: number;
    stagedCapital: number;
    state: PulseState;
}

/**
 * currentMonth counts STAGINGS COMPLETED, not a calendar index — it starts
 * at 0 ("nothing staged yet") and becomes 3 exactly when the third staging
 * lands, which is also the moment state flips to "strike".
 *
 * A PREVIOUS VERSION STARTED AT 1 AND HAD AN OFF-BY-ONE
 * -------------------------------------------------------
 * currentMonth began at 1 with zero actually staged, so after two clicks
 * currentMonth read 3 while only two months' money had been added — and the
 * UI, computing its button label as "Stage month {currentMonth + 1}", showed
 * a "Stage month 4" button for a strategy that is explicitly three months.
 * Clicking it added a FOURTH month's contribution before finally flipping to
 * "strike", so the capital a user saw at deploy time was 4x the monthly
 * amount, not 3x. Starting the counter at "stagings completed" instead of
 * "calendar month" removes the phantom step entirely: the third click is
 * the last one, full stop.
 */
export function initializePulse(): PulseData {
    return {
        month: 0,
        currentMonth: 0,
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

    return {
        month: newMonth,
        currentMonth: newMonth,
        totalStaged: newTotal,
        stagedCapital: newTotal,
        // Ready as soon as the third staging lands - not on some later,
        // separate click.
        state: newMonth >= 3 ? "strike" : "staging",
    };
}
