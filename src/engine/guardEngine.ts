export interface GuardInput {
    emotion: "calm" | "stressed" | "fomo";
    streakActive: boolean;
    riskProfile: "conservative" | "balanced" | "aggressive";
}

export interface GuardResult {
    finalScore: number;
    allowExecution: boolean;
}

function emotionGuard(emotion: GuardInput["emotion"]): number {
    return emotion === "calm" ? 1 : 0.4;
}

function disciplineGuard(streak: boolean): number {
    return streak ? 1 : 0.5;
}

function riskGuard(risk: GuardInput["riskProfile"]): number {
    switch (risk) {
        case "conservative":
            return 0.8;
        case "balanced":
            return 0.9;
        case "aggressive":
            return 1;
    }
}

export function evaluateGuards(
    input: GuardInput
): GuardResult {
    const emotionScore = emotionGuard(input.emotion);
    const disciplineScore = disciplineGuard(input.streakActive);
    const riskScore = riskGuard(input.riskProfile);

    const finalScore =
        emotionScore * 0.4 +
        disciplineScore * 0.3 +
        riskScore * 0.3;

    return {
        finalScore: Number(finalScore.toFixed(2)),
        allowExecution: finalScore >= 0.75,
    };
}
