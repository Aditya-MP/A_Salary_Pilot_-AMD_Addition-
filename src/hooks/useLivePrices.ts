import { useEffect, useState } from 'react';

interface PriceData {
  equity: number;
  crypto: number;
  esg: number;
  gold: number;
  btc: number;
  eth: number;
  sp500: number;
  nasdaq: number;
}

export const BASE_PRICES: PriceData = {
  equity: 100,
  crypto: 50000,
  esg: 100,
  gold: 2000,
  btc: 43250,
  eth: 2280,
  sp500: 4800,
  nasdaq: 15200,
};

const VOLATILITY: Record<keyof PriceData, number> = {
  equity: 0.002,
  crypto: 0.008,
  esg: 0.001,
  gold: 0.001,
  btc: 0.01,
  eth: 0.012,
  sp500: 0.0015,
  nasdaq: 0.002,
};

export function useLivePrices() {
  const [prices, setPrices] = useState<PriceData>(BASE_PRICES);
  const [changes, setChanges] = useState<Record<keyof PriceData, number>>({
    equity: 0,
    crypto: 0,
    esg: 0,
    gold: 0,
    btc: 0,
    eth: 0,
    sp500: 0,
    nasdaq: 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setPrices((prev) => {
        const newPrices = { ...prev };
        const newChanges = { ...changes };

        (Object.keys(prev) as Array<keyof PriceData>).forEach((key) => {
          const volatility = VOLATILITY[key];
          const change = (Math.random() - 0.5) * 2 * volatility;
          newPrices[key] = prev[key] * (1 + change);
          newChanges[key] = ((newPrices[key] - BASE_PRICES[key]) / BASE_PRICES[key]) * 100;
        });

        setChanges(newChanges);
        return newPrices;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return { prices, changes };
}

export function calculatePortfolioValue(holdings: { equity: number; crypto: number; esg: number }, prices: PriceData) {
  return (
    (holdings.equity / BASE_PRICES.equity) * prices.equity +
    (holdings.crypto / BASE_PRICES.crypto) * prices.crypto +
    (holdings.esg / BASE_PRICES.esg) * prices.esg
  );
}
