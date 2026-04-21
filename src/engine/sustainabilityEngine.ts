import type { AssetType } from "./taxEngine";

const sustainabilityFactors: Record<AssetType, number> = {
    equity: 0.00002,
    crypto: 0.000005,
    esg: 0.00005,
};

export function calculateSustainabilityImpact(
    amount: number,
    assetMix: { asset: AssetType; allocation: number }[],
    streakActive: boolean
) {
    let totalImpact = 0;

    assetMix.forEach(({ asset, allocation }) => {
        const investedAmount = amount * allocation;
        totalImpact += investedAmount * sustainabilityFactors[asset];
    });

    // Discipline bonus
    if (streakActive) {
        totalImpact *= 1.1;
    }

    return Number(totalImpact.toFixed(3));
}
