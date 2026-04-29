import { useState, useEffect } from 'react';

export interface TickerItem {
  name: string;
  brl: number;
}

const COINGECKO_IDS: Record<string, string> = {
  bitcoin: 'Bitcoin',
  ethereum: 'Ethereum',
  tether: 'USDT',
  binancecoin: 'BNB',
};

export function usePriceTicker() {
  const [tickerItems, setTickerItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const ids = Object.keys(COINGECKO_IDS).join(',');
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=brl`
        );
        const data = await res.json();
        const list = Object.entries(data as Record<string, { brl?: number }>).map(([id, v]) => ({
          name: COINGECKO_IDS[id] || id,
          brl: v.brl ?? 0,
        }));
        setTickerItems(list.filter((x: TickerItem) => x.brl > 0));
      } catch {
        setTickerItems([]);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
  }, []);

  return { tickerItems };
}
