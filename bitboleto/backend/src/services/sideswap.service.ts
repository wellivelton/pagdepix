import { WebSocket } from 'ws';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as liquid from 'liquidjs-lib';
import * as crypto from 'crypto';
import { prisma } from '../prisma';

const bip32 = BIP32Factory(ecc);

const WS_URL     = process.env.SIDESWAP_WS_URL || 'wss://api-testnet.sideswap.io/json-rpc-ws';
const IS_TESTNET = process.env.SIDESWAP_TESTNET === 'true';
const MNEMONIC   = process.env.LIQUID_MNEMONIC || '';

const LIQUID_NETWORK = IS_TESTNET ? liquid.networks.testnet : liquid.networks.liquid;

// ─── SLIP77 ───────────────────────────────────────────────────────────────────

function slip77MasterBlindingKey(seed: Buffer): Buffer {
  return crypto.createHmac('sha512', Buffer.from('Symmetric key seed', 'utf8'))
    .update(seed)
    .digest()
    .slice(0, 32);
}

// ─── Key derivation ───────────────────────────────────────────────────────────

function getMasterNode() {
  if (!MNEMONIC) throw new Error('[SideSwap] LIQUID_MNEMONIC not configured');
  if (!cachedNode) {
    const seed = bip39.mnemonicToSeedSync(MNEMONIC);
    cachedNode = bip32.fromSeed(seed, LIQUID_NETWORK as any);
  }
  return { node: cachedNode };
}

// ─── WebSocket client ─────────────────────────────────────────────────────────

interface JsonRpcResponse {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

class SideSwapWsClient {
  private ws: WebSocket | null = null;
  private msgId = 1;
  private pending = new Map<number, PendingRequest>();
  // Set per method → multiple concurrent callers don't overwrite each other
  private subscriptions = new Map<string, Set<(params: unknown) => void>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Array<() => void> = [];
  private ready = false;

  constructor(private readonly url: string) {}

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log(`[SideSwap] Connected to ${this.url}`);
      this.reconnectAttempt = 0;
      this.ready = true;
      this.drainQueue();
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg: JsonRpcResponse = JSON.parse(raw.toString());

        // Server-push notification (no id)
        if (msg.id === undefined && msg.method && msg.params !== undefined) {
          const handlers = this.subscriptions.get(msg.method);
          if (handlers) { for (const h of handlers) h(msg.params); }
          return;
        }

        // Response to a request
        if (msg.id !== undefined) {
          const pending = this.pending.get(msg.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(`[SideSwap] ${msg.error.message} (code ${msg.error.code})`));
          } else {
            pending.resolve(msg.result);
          }
        }
      } catch {
        // malformed frame — ignore
      }
    });

    this.ws.on('close', () => {
      this.ready = false;
      this.rejectAllPending(new Error('[SideSwap] WebSocket closed'));
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[SideSwap] WS error:', err.message);
    });
  }

  private scheduleReconnect() {
    if (this.reconnectAttempt >= 5) {
      console.error('[SideSwap] Max reconnect attempts reached. Giving up.');
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30_000);
    this.reconnectAttempt++;
    console.log(`[SideSwap] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private rejectAllPending(err: Error) {
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(err);
    });
    this.pending.clear();
  }

  private drainQueue() {
    const q = this.queue.splice(0);
    for (const fn of q) fn();
  }

  sendRequest<T = unknown>(method: string, params: unknown, timeoutMs = 30_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const send = () => {
        const id = this.msgId++;
        const msg = JSON.stringify({ id, method, params });
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`[SideSwap] Request timeout: ${method}`));
        }, timeoutMs);
        this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        this.ws!.send(msg);
      };

      if (this.ready) {
        send();
      } else {
        this.queue.push(send);
      }
    });
  }

  subscribe(method: string, handler: (params: unknown) => void) {
    let set = this.subscriptions.get(method);
    if (!set) { set = new Set(); this.subscriptions.set(method, set); }
    set.add(handler);
  }

  // Pass handler to remove only that subscriber; omit to wipe all for method.
  unsubscribe(method: string, handler?: (params: unknown) => void) {
    if (handler) {
      this.subscriptions.get(method)?.delete(handler);
    } else {
      this.subscriptions.delete(method);
    }
  }

  isReady() { return this.ready; }

  close() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempt = 5; // block further reconnects
    this.ws?.close();
  }
}

// Singleton client — created on first use
let client: SideSwapWsClient | null = null;

// Fix 1: cache master node — avoid repeated PBKDF2 on every sign
let cachedNode: ReturnType<typeof bip32.fromSeed> | null = null;

export function getSideSwapClient(): SideSwapWsClient {
  if (!client) {
    client = new SideSwapWsClient(WS_URL);
    client.connect();
  }
  return client;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SideSwapAsset {
  asset_id: string;
  name: string;
  ticker: string;
  precision: number;
  icon?: string;
}

export interface SideSwapMarket {
  asset_pair: { base: string; quote: string };
  fee_asset: 'Base' | 'Quote';
  type: 'Stablecoin' | 'Amp' | 'Token';
}

export interface SideSwapQuoteResult {
  quoteId: number;
  quoteSubId: number;
  baseAmount: number;
  quoteAmount: number;
  serverFee: number;
  ttl: number;
  psetBase64: string;
  depositIsBase: boolean;
}

// ─── listMarkets ─────────────────────────────────────────────────────────────

let marketsCache: {
  assets: SideSwapAsset[];
  markets: SideSwapMarket[];
  cachedAt: number;
} | null = null;

const MARKETS_TTL = 60_000;

export async function listMarkets(): Promise<{
  assets: SideSwapAsset[];
  markets: SideSwapMarket[];
}> {
  if (marketsCache && Date.now() - marketsCache.cachedAt < MARKETS_TTL) {
    return { assets: marketsCache.assets, markets: marketsCache.markets };
  }

  const c = getSideSwapClient();

  const [assetsRaw, marketsRaw] = await Promise.all([
    c.sendRequest<{ assets: SideSwapAsset[] }>('assets', { embedded_icons: false }),
    c.sendRequest<{ markets: SideSwapMarket[] }>('market', { list_markets: {} }),
  ]);

  const assets: SideSwapAsset[] = (assetsRaw as any)?.assets ?? [];
  // Response shape: { list_markets: { markets: [...], token_quotes: [...] } }
  const markets: SideSwapMarket[] = (marketsRaw as any)?.list_markets?.markets ?? [];

  // Log DePix-related assets for diagnostics
  const depixAssets = assets.filter(a =>
    /depix|brlx|brl/i.test(a.ticker + a.name)
  );
  if (depixAssets.length > 0) {
    console.log('[SideSwap] ✅ DePix assets found:', JSON.stringify(depixAssets));
  } else {
    console.warn('[SideSwap] ❌ DePix NOT found. Available tickers:', assets.map(a => a.ticker).join(', '));
  }

  marketsCache = { assets, markets, cachedAt: Date.now() };
  return { assets, markets };
}

// ─── getQuote ─────────────────────────────────────────────────────────────────

export interface SwapUtxo {
  txid: string;
  vout: number;
  asset: string;
  asset_bf: string;
  value: number;
  value_bf: string;
  redeem_script: string | null;
}

export interface GetQuoteParams {
  depositAssetId: string;   // asset the user is sending (has UTXOs for)
  settleAssetId: string;    // asset the user wants to receive
  sendAmount: number;       // in deposit asset satoshis
  receiveAddress: string;
  changeAddress: string;
  utxos: SwapUtxo[];
}

export async function getQuote(params: GetQuoteParams): Promise<SideSwapQuoteResult> {
  // Resolve market pair — SideSwap fixes which asset is base vs quote
  const { markets } = await listMarkets();
  const market = markets.find(m =>
    (m.asset_pair.base === params.depositAssetId && m.asset_pair.quote === params.settleAssetId) ||
    (m.asset_pair.base === params.settleAssetId  && m.asset_pair.quote === params.depositAssetId)
  );
  if (!market) {
    throw new Error(`[SideSwap] No market found for ${params.depositAssetId} ↔ ${params.settleAssetId}`);
  }

  // If user is sending the base asset → Buy (buying quote with base);
  // if sending the quote asset → Sell (selling quote for base)
  const depositIsBase = market.asset_pair.base === params.depositAssetId;
  const tradeDir  = depositIsBase ? 'Buy' : 'Sell';
  const assetType = depositIsBase ? 'Base' : 'Quote';

  const c = getSideSwapClient();

  return new Promise((resolve, reject) => {
    let quoteSubId: number | null = null;
    let settled = false;

    const marketHandler = async (rawParams: unknown) => {
      if (settled) return;
      const p = rawParams as any;
      if (!p?.quote) return;
      const q = p.quote;

      // Only process notifications for our subscription
      if (quoteSubId !== null && q.quote_sub_id !== undefined && q.quote_sub_id !== quoteSubId) return;

      if (q.status?.Error) {
        settled = true;
        clearTimeout(timeout);
        cleanup();
        reject(new Error(`[SideSwap] Quote error: ${q.status.Error}`));
        return;
      }

      if (q.status?.Success) {
        const s = q.status.Success as {
          base_amount: number;
          quote_amount: number;
          server_fee: number;
          fixed_fee: number;
          quote_id: number;
          ttl: number;
        };
        try {
          const psetRaw = await c.sendRequest<{ pset: string }>('market', {
            get_quote: { quote_id: s.quote_id },
          });
          settled = true;
          clearTimeout(timeout);
          cleanup();
          resolve({
            quoteId: s.quote_id,
            quoteSubId: quoteSubId!,
            baseAmount: s.base_amount,
            quoteAmount: s.quote_amount,
            serverFee: s.server_fee,
            ttl: s.ttl,
            psetBase64: (psetRaw as any).get_quote?.pset ?? (psetRaw as any).pset,
            depositIsBase,
          });
        } catch (err) {
          settled = true;
          clearTimeout(timeout);
          cleanup();
          reject(err);
        }
      }
    };

    const cleanup = () => {
      c.unsubscribe('market', marketHandler);
      if (quoteSubId !== null) {
        c.sendRequest('market', { stop_quotes: { quote_sub_id: quoteSubId } }).catch(() => {});
      }
    };

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('[SideSwap] Quote timeout after 30s'));
      }
    }, 30_000);

    c.subscribe('market', marketHandler);

    const startQuotesPayload = {
      asset_pair: market.asset_pair,
      asset_type: assetType,
      amount: params.sendAmount,
      trade_dir: tradeDir,
      utxos: params.utxos,
      receive_address: params.receiveAddress,
      change_address: params.changeAddress,
    };
    console.log('[SideSwap] → start_quotes:', JSON.stringify(startQuotesPayload));

    c.sendRequest<{ quote_sub_id: number }>('market', {
      start_quotes: startQuotesPayload,
    }).then(res => {
      quoteSubId = (res as any).start_quotes?.quote_sub_id ?? (res as any).quote_sub_id ?? null;
    }).catch(err => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        cleanup();
        reject(err);
      }
    });
  });
}

// ─── signAndBroadcast ─────────────────────────────────────────────────────────

export async function signAndBroadcast(
  psetBase64: string,
  quoteId: number,
  swapId: string,
  derivationPaths: string[],
  ourUtxo?: { txid: string; vout: number; prevout: Record<string, unknown> },
): Promise<string> {
  const { node } = getMasterNode();
  const pset = liquid.Pset.fromBase64(psetBase64);

  const ourKeys: Array<{ pubkey: Buffer; privKey: Buffer; script: Buffer }> = [];
  for (const p of derivationPaths) {
    const child = node.derivePath(p);
    if (!child.privateKey) continue;
    const pubkey = Buffer.from(child.publicKey);
    const p2wpkh = liquid.payments.p2wpkh({ pubkey, network: LIQUID_NETWORK });
    ourKeys.push({ pubkey, privKey: Buffer.from(child.privateKey), script: p2wpkh.output! });
  }

  for (let i = 0; i < pset.inputs.length; i++) {
    const input = pset.inputs[i];
    if (input.finalScriptWitness || input.finalScriptSig) continue;

    // Match our input by txid:vout, fallback to script match
    let isOurs = false;
    if (ourUtxo) {
      const txid = Buffer.from(input.previousTxid).reverse().toString('hex');
      isOurs = txid === ourUtxo.txid && input.previousTxIndex === ourUtxo.vout;
    }
    if (!isOurs) {
      const ws = (input as any).witnessUtxo?.script as Buffer | undefined;
      if (ws) isOurs = ourKeys.some(k => ws.equals(k.script));
    }
    if (!isOurs) continue;

    // Populate witnessUtxo if absent (should always be present in SideSwap PSETs)
    if (!(input as any).witnessUtxo && ourUtxo?.prevout) {
      (pset.inputs[i] as any).witnessUtxo = ourUtxo.prevout;
    }

    const ws = (pset.inputs[i] as any).witnessUtxo?.script as Buffer | undefined;
    const key = ws ? ourKeys.find(k => ws.equals(k.script)) : ourKeys[0];
    if (!key) continue;

    pset.inputs[i].sighashType = 0x01;
    const preimage = pset.getInputPreimage(i, 0x01);
    const sig = Buffer.from(ecc.sign(preimage, key.privKey));
    pset.inputs[i].partialSigs = [{ pubkey: key.pubkey, signature: liquid.script.signature.encode(sig, 0x01) }];

    // SideSwap taker_sign requires finalScriptWitness, not just partialSigs
    new liquid.Finalizer(pset).finalizeInput(i);
    console.log(`[SideSwap] signed+finalized input ${i}`);
  }

  const signedPsetB64 = pset.toBase64();

  // Fix 3: persist signed PSET before broadcasting — enables recovery if WS drops
  await prisma.sideswapSwap.update({
    where: { id: swapId },
    data: { rawPset: signedPsetB64, updatedAt: new Date() },
  });

  // Fix 3: retry taker_sign up to 3 times (2s / 4s backoff)
  const c = getSideSwapClient();
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await c.sendRequest<{ txid: string }>('market', {
        taker_sign: { quote_id: quoteId, pset: signedPsetB64 },
      });

      const txid = ((result as any).taker_sign?.txid ?? (result as any).txid) as string;

      await prisma.sideswapSwap.update({
        where: { id: swapId },
        data: { status: 'completed', settleTxid: txid, updatedAt: new Date() },
      });

      await logSwapEvent(swapId, 'broadcasting', 'completed', { txid });
      console.log(`[SideSwap] Swap ${swapId} completed — txid: ${txid}`);
      return txid;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message.toLowerCase();
      if (msg.includes('expired') || msg.includes('not found')) {
        await logSwapEvent(swapId, 'broadcasting', 'failed', { error: lastErr.message });
        throw lastErr;
      }
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
  }

  await logSwapEvent(swapId, 'broadcasting', 'failed', { error: lastErr?.message ?? 'max_retries' });
  throw lastErr!;
}

// ─── getPreviewQuote ──────────────────────────────────────────────────────────

export interface PreviewQuoteResult {
  baseAmount: number;
  quoteAmount: number;
  serverFee: number;
  fixedFee: number;
  feeAsset: 'Base' | 'Quote';
  depositIsBase: boolean;
  marketBase: string;
  marketQuote: string;
}

export async function getPreviewQuote(params: {
  depositAssetId: string;
  settleAssetId: string;
  sendAmountSats: number;
  receiveAddress: string;
  changeAddress: string;
}): Promise<PreviewQuoteResult> {
  const { markets } = await listMarkets();
  const market = markets.find(m =>
    (m.asset_pair.base === params.depositAssetId && m.asset_pair.quote === params.settleAssetId) ||
    (m.asset_pair.base === params.settleAssetId  && m.asset_pair.quote === params.depositAssetId),
  );
  if (!market) {
    throw new Error(`[SideSwap] No market for ${params.depositAssetId} ↔ ${params.settleAssetId}`);
  }

  const depositIsBase = market.asset_pair.base === params.depositAssetId;
  const tradeDir  = depositIsBase ? 'Buy' : 'Sell';
  const assetType = depositIsBase ? 'Base' : 'Quote';

  const c = getSideSwapClient();

  return new Promise((resolve, reject) => {
    let quoteSubId: number | null = null;
    let settled = false;

    const marketHandler = (rawParams: unknown) => {
      if (settled) return;
      const p = rawParams as any;
      if (!p?.quote) return;
      const q = p.quote;

      if (quoteSubId !== null && q.quote_sub_id !== undefined && q.quote_sub_id !== quoteSubId) return;

      const successData  = q.status?.Success as any;
      const lowBalData   = q.status?.LowBalance as any;
      const errorMsg     = q.status?.Error as any;
      const priceData    = successData ?? lowBalData;

      if (errorMsg) {
        settled = true;
        clearTimeout(timeout);
        cleanup();
        reject(new Error(`[SideSwap] Preview error: ${errorMsg}`));
        return;
      }

      if (priceData?.base_amount !== undefined && priceData?.quote_amount !== undefined) {
        settled = true;
        clearTimeout(timeout);
        cleanup();
        resolve({
          baseAmount: priceData.base_amount,
          quoteAmount: priceData.quote_amount,
          serverFee: priceData.server_fee ?? 0,
          fixedFee: priceData.fixed_fee ?? 0,
          feeAsset: market.fee_asset,
          depositIsBase,
          marketBase: market.asset_pair.base,
          marketQuote: market.asset_pair.quote,
        });
      }
    };

    const cleanup = () => {
      c.unsubscribe('market', marketHandler);
      if (quoteSubId !== null) {
        c.sendRequest('market', { stop_quotes: { quote_sub_id: quoteSubId } }).catch(() => {});
      }
    };

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('[SideSwap] Preview timeout after 20s'));
      }
    }, 20_000);

    c.subscribe('market', marketHandler);

    c.sendRequest<unknown>('market', {
      start_quotes: {
        asset_pair: market.asset_pair,
        asset_type: assetType,
        amount: params.sendAmountSats,
        trade_dir: tradeDir,
        utxos: [],
        receive_address: params.receiveAddress,
        change_address: params.changeAddress,
      },
    }).then(res => {
      quoteSubId = (res as any).start_quotes?.quote_sub_id ?? (res as any).quote_sub_id ?? null;
    }).catch(err => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        cleanup();
        reject(err);
      }
    });
  });
}

// ─── isSideSwapConfigured ─────────────────────────────────────────────────────

export function isSideSwapConfigured(): boolean {
  return !!MNEMONIC && !!WS_URL;
}

// ─── Audit log (Fix 5) ────────────────────────────────────────────────────────

export async function logSwapEvent(
  swapId: string,
  fromStatus: string,
  toStatus: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO sideswap_audit_log (swap_id, from_status, to_status, metadata, created_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())`,
    swapId,
    fromStatus,
    toStatus,
    JSON.stringify(metadata ?? {}),
  );
}
