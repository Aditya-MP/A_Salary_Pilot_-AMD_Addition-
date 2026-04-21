export interface TrendAnalysis {
    confidence: number;      // 0 - 100
    volatility: number;      // 0 - 1
    entrySignal: "strong" | "moderate" | "weak";
}

export function analyzeMarket(): TrendAnalysis {
    const confidence = Math.floor(Math.random() * 40) + 60; // 60–100%
    const volatility = Math.random();

    let entrySignal: "strong" | "moderate" | "weak";

    if (confidence > 80 && volatility < 0.4) {
        entrySignal = "strong";
    } else if (confidence > 70) {
        entrySignal = "moderate";
    } else {
        entrySignal = "weak";
    }

    return {
        confidence,
        volatility: Number(volatility.toFixed(2)),
        entrySignal,
    };
}
