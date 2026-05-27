import { prisma } from '../prisma';

export interface Rates {
  usdBrl: number;
  btcBrl: number;
  btcUsd: number;
  fetchedAt: Date;
  provider: 'awesomeapi' | 'coingecko' | 'db_cache';
}

const CACHE_TTL_MS = 60_000;

let memoryCache: Rates | null = null;

async function fetchFromAwesomeApi(): Promise<Rates> {
  const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,BTC-BRL');
  if (!res.ok) throw new Error(`AwesomeAPI ${res.status}`);
  const data: any = await res.json();

  const usdBrl = parseFloat(data['USDBRL']?.bid);
  const btcBrl = parseFloat(data['BTCBRL']?.bid);
  if (!usdBrl || !btcBrl) throw new Error('AwesomeAPI: campos ausentes');

  return {
    usdBrl,
    btcBrl,
    btcUsd: btcBrl / usdBrl,
    fetchedAt: new Date(),
    provider: 'awesomeapi',
  };
}

async function fetchFromCoinGecko(): Promise<Rates> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,tether&vs_currencies=brl,usd'
  );
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data: any = await res.json();

  const btcBrl = data?.bitcoin?.brl;
  const btcUsd = data?.bitcoin?.usd;
  const usdtBrl = data?.tether?.brl;
  if (!btcBrl || !btcUsd || !usdtBrl) throw new Error('CoinGecko: campos ausentes');

  return {
    usdBrl: usdtBrl,
    btcBrl,
    btcUsd,
    fetchedAt: new Date(),
    provider: 'coingecko',
  };
}

async function persistToDb(rates: Rates): Promise<void> {
  try {
    await prisma.exchangeRateCache.upsert({
      where: { id: 'rates' },
      update: {
        usdBrl: rates.usdBrl,
        btcBrl: rates.btcBrl,
        btcUsd: rates.btcUsd,
        fetchedAt: rates.fetchedAt,
      },
      create: {
        id: 'rates',
        usdBrl: rates.usdBrl,
        btcBrl: rates.btcBrl,
        btcUsd: rates.btcUsd,
        fetchedAt: rates.fetchedAt,
      },
    });
  } catch (e) {
    console.error('[ExchangeRate] Erro ao persistir cache no DB:', e);
  }
}

async function loadFromDb(): Promise<Rates | null> {
  try {
    const row = await prisma.exchangeRateCache.findUnique({ where: { id: 'rates' } });
    if (!row) return null;
    return {
      usdBrl: row.usdBrl,
      btcBrl: row.btcBrl,
      btcUsd: row.btcUsd,
      fetchedAt: row.fetchedAt,
      provider: 'db_cache',
    };
  } catch {
    return null;
  }
}

function isFresh(rates: Rates | null): boolean {
  if (!rates) return false;
  return Date.now() - rates.fetchedAt.getTime() < CACHE_TTL_MS;
}

export async function getRates(): Promise<Rates> {
  if (isFresh(memoryCache)) return memoryCache!;

  try {
    const rates = await fetchFromAwesomeApi();
    memoryCache = rates;
    persistToDb(rates).catch(() => {});
    return rates;
  } catch (e) {
    console.warn('[ExchangeRate] AwesomeAPI falhou, tentando CoinGecko:', (e as Error).message);
  }

  try {
    const rates = await fetchFromCoinGecko();
    memoryCache = rates;
    persistToDb(rates).catch(() => {});
    return rates;
  } catch (e) {
    console.warn('[ExchangeRate] CoinGecko falhou, usando cache DB:', (e as Error).message);
  }

  const dbRates = await loadFromDb();
  if (dbRates) {
    memoryCache = dbRates;
    return dbRates;
  }

  throw new Error('Não foi possível obter cotações. Tente novamente em instantes.');
}

export function convertBrlToUsdt(brl: number, usdBrlRate: number): number {
  return Math.ceil((brl / usdBrlRate) * 100) / 100;
}

export function convertBrlToSats(brl: number, btcBrlRate: number): number {
  const btc = brl / btcBrlRate;
  return Math.ceil(btc * 1e8);
}

export function formatCryptoAmount(currency: string, cryptoAmount: number): string {
  switch (currency) {
    case 'USDT':
      return `${cryptoAmount.toFixed(2)} USDT`;
    case 'BTC':
      return `${cryptoAmount.toLocaleString('pt-BR')} sats`;
    default:
      return `${cryptoAmount.toFixed(2)} DPX`;
  }
}
