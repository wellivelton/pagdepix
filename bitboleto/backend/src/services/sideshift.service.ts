const BASE = 'https://sideshift.ai/api/v2';
const SECRET = process.env.SIDESHIFT_SECRET || '';
const AFFILIATE_ID = process.env.SIDESHIFT_AFFILIATE_ID || '';
const COMMISSION_RATE = 0.5;

// Popular coins shown first in the UI
const POPULAR_TICKERS = new Set([
  'BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE',
  'ADA', 'AVAX', 'MATIC', 'LTC', 'TRX', 'LINK', 'DOT', 'SHIB',
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SideShiftCoin {
  coin: string;
  name: string;
  networks: string[];
  networksWithMemo: string[];
  fixedOnly: boolean | string[];
  variableOnly: boolean | string[];
  depositOffline: boolean;
  settleOffline: boolean;
  tokenDetails: Record<string, { contractAddress: string; decimals: number }>;
}

export interface SideShiftPair {
  min: string;
  max: string;
  rate: string;
  depositCoin: string;
  settleCoin: string;
  depositNetwork: string;
  settleNetwork: string;
  networkFeeUsd?: string;
  settleCoinNetworkFee?: string;
}

export interface SideShiftQuote {
  id: string;
  createdAt: string;
  expiresAt: string;
  depositCoin: string;
  settleCoin: string;
  depositNetwork: string;
  settleNetwork: string;
  depositAmount: string;
  settleAmount: string;
  rate: string;
  affiliateId: string;
}

export interface SideShiftShift {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  type: 'fixed' | 'variable';
  status: 'pending' | 'settled' | 'refund' | 'refunded' | 'expired' | 'multiple' | 'waiting';
  depositCoin: string;
  settleCoin: string;
  depositNetwork: string;
  settleNetwork: string;
  depositAddress: string;
  depositMemo?: string;
  settleAddress: string;
  refundAddress?: string;
  depositMin?: string;
  depositMax?: string;
  depositAmount?: string;
  settleAmount?: string;
  depositHash?: string;
  settleHash?: string;
  depositReceivedAt?: string;
  rate?: string;
  quoteId?: string;
  averageShiftSeconds?: number;
  networkFeeUsd?: string;
  settleCoinNetworkFee?: string;
  externalId?: string;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

let coinsCache: SideShiftCoin[] | null = null;
let coinsCachedAt = 0;
const COINS_TTL = 60 * 60 * 1000; // 1 hour

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return !!(SECRET && AFFILIATE_ID);
}

function isPublicIp(ip: string): boolean {
  if (!ip) return false;
  if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') return false;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) return false;
  if (ip.startsWith('::ffff:127.') || ip.startsWith('::ffff:192.168.') || ip.startsWith('::ffff:10.')) return false;
  return true;
}

function buildHeaders(userIp?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-sideshift-secret': SECRET,
  };
  if (userIp && isPublicIp(userIp)) h['x-user-ip'] = userIp;
  return h;
}

async function ssGet<T>(path: string, userIp?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: buildHeaders(userIp),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.error?.message || (data as any)?.message || `SideShift ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

async function ssPost<T>(path: string, body: object, userIp?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: buildHeaders(userIp),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.error?.message || (data as any)?.message || `SideShift ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

function sortByPopularity(coins: SideShiftCoin[]): SideShiftCoin[] {
  return [...coins].sort((a, b) => {
    const aP = POPULAR_TICKERS.has(a.coin.toUpperCase()) ? 0 : 1;
    const bP = POPULAR_TICKERS.has(b.coin.toUpperCase()) ? 0 : 1;
    if (aP !== bP) return aP - bP;
    return a.coin.localeCompare(b.coin);
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function sideshiftConfigured(): boolean {
  return isConfigured();
}

export async function getCoins(): Promise<SideShiftCoin[]> {
  const now = Date.now();
  if (coinsCache && now - coinsCachedAt < COINS_TTL) return coinsCache;

  const coins = await ssGet<SideShiftCoin[]>('/coins');
  coinsCache = sortByPopularity(Array.isArray(coins) ? coins : []);
  coinsCachedAt = now;
  return coinsCache;
}

export async function getPair(
  from: string,
  to: string,
  amount?: string,
  userIp?: string,
): Promise<SideShiftPair> {
  const qs = new URLSearchParams({ affiliateId: AFFILIATE_ID });
  if (amount) qs.set('amount', amount);
  return ssGet<SideShiftPair>(`/pair/${encodeURIComponent(from)}/${encodeURIComponent(to)}?${qs}`, userIp);
}

export async function requestQuote(params: {
  depositCoin: string;
  depositNetwork: string;
  settleCoin: string;
  settleNetwork: string;
  depositAmount?: string;
  settleAmount?: string;
}, userIp?: string): Promise<SideShiftQuote> {
  return ssPost<SideShiftQuote>('/quotes', {
    ...params,
    affiliateId: AFFILIATE_ID,
    commissionRate: COMMISSION_RATE,
  }, userIp);
}

export async function createFixedShift(params: {
  quoteId: string;
  settleAddress: string;
  settleMemo?: string;
  refundAddress?: string;
  externalId?: string;
}, userIp?: string): Promise<SideShiftShift> {
  return ssPost<SideShiftShift>('/shifts/fixed', {
    ...params,
    affiliateId: AFFILIATE_ID,
  }, userIp);
}

export async function createVariableShift(params: {
  depositCoin: string;
  depositNetwork: string;
  settleCoin: string;
  settleNetwork: string;
  settleAddress: string;
  settleMemo?: string;
  refundAddress?: string;
  externalId?: string;
}, userIp?: string): Promise<SideShiftShift> {
  return ssPost<SideShiftShift>('/shifts/variable', {
    ...params,
    affiliateId: AFFILIATE_ID,
    commissionRate: COMMISSION_RATE,
  }, userIp);
}

export async function getShift(shiftId: string): Promise<SideShiftShift> {
  return ssGet<SideShiftShift>(`/shifts/${encodeURIComponent(shiftId)}`);
}
