export function evaluateDecision(
    emotion: "calm" | "stressed",
    streak: boolean
) {
    if (emotion !== "calm") return false;
    if (!streak) return false;
    return true;
}
