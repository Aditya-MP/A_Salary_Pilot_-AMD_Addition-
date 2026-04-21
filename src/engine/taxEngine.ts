export type AssetType = "equity" | "crypto" | "esg";

export function calculateNetReturn(
    amount: number,
    asset: AssetType
) {
    let taxRate = 0;

    switch (asset) {
        case "equity":
            taxRate = 0.125;
            break;
        case "crypto":
            taxRate = 0.3;
            break;
        case "esg":
            taxRate = 0.25;
            break;
    }

    const tax = amount * taxRate;
    const net = amount - tax;

    return {
        gross: amount,
        tax,
        net,
        taxRate,
    };
}
