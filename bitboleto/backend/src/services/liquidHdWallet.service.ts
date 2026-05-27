import * as ecc from 'tiny-secp256k1';
import BIP32Factory from 'bip32';
import * as liquid from 'liquidjs-lib';
import * as crypto from 'crypto';

const bip32 = BIP32Factory(ecc);

// ============================================================
// Asset IDs on Liquid mainnet — configurable via env
// ============================================================
export const LIQUID_ASSET_IDS: Record<string, string> = {
  DEPIX: process.env.DEPIX_ASSET_ID || '02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189',
  USDT:  process.env.USDT_ASSET_ID  || 'ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2',
  BTC:   process.env.LBTC_ASSET_ID  || '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d',
};

export function getAssetId(currency: string): string {
  const id = LIQUID_ASSET_IDS[currency];
  if (!id) throw new Error(`Asset ID not configured for currency: ${currency}`);
  return id;
}

// All Liquid assets use 8 decimal places (1e8 precision)
const ASSET_PRECISION = 1e8;

// Allow small rounding tolerance in amount check (0.000005 of any asset)
const AMOUNT_TOLERANCE = 500; // base units

// Minimum confirmed blocks required before accepting a payment.
// Liquid block time ~1 min. Default 2 = ~2 min finality, good balance of security vs speed.
// Override with MIN_LIQUID_CONFIRMATIONS env var if needed.
const MIN_LIQUID_CONFIRMATIONS = parseInt(process.env.MIN_LIQUID_CONFIRMATIONS || '2', 10);

/**
 * Converts order fields to expected base units for a given currency.
 *
 * BTC:   cryptoAmount is already stored as integer satoshis (no multiplication)
 * USDT:  cryptoAmount is stored as decimal string "47.50" → multiply × 1e8
 * DEPIX: cryptoAmount is null → use totalFinal (BRL) × 1e8  (1 DePix = 1 BRL)
 */
export function computeExpectedUnits(
  currency: string,
  totalFinal: number,
  cryptoAmount: string | null,
): number {
  if (currency === 'BTC') {
    // Stored as satoshis integer string e.g. "500000"
    const sats = parseInt(cryptoAmount ?? '0', 10);
    if (!Number.isFinite(sats) || sats <= 0) {
      throw new Error(`Invalid BTC cryptoAmount: ${cryptoAmount}`);
    }
    return sats;
  }
  if (currency === 'USDT') {
    // Stored as decimal USDT string e.g. "47.50"
    const units = Math.round(parseFloat(cryptoAmount ?? '0') * ASSET_PRECISION);
    if (!Number.isFinite(units) || units <= 0) {
      throw new Error(`Invalid USDT cryptoAmount: ${cryptoAmount}`);
    }
    return units;
  }
  // DEPIX: 1 DePix = 1 BRL, cryptoAmount not stored
  return Math.round(totalFinal * ASSET_PRECISION);
}

const ESPLORA_BASE = process.env.ESPLORA_BASE_URL || 'https://blockstream.info/liquid/api';

// Singleton: secp256k1-zkp WASM module (async init, reused)
let zkpInstance: any = null;
async function getZkp(): Promise<any> {
  if (!zkpInstance) {
    const { default: initZkp } = await import('@vulpemventures/secp256k1-zkp');
    zkpInstance = await initZkp();
  }
  return zkpInstance;
}

/**
 * SLIP77 blinding key derivation.
 * blindingPrivKey = HMAC-SHA256(masterBlindingKey, childPublicKey)
 */
function slip77BlindingPrivKey(masterBlindingKey: Buffer, childPubKey: Buffer): Buffer {
  return crypto.createHmac('sha256', masterBlindingKey).update(childPubKey).digest();
}

/**
 * Derives a unique confidential Liquid address (lq1qq...) and its blinding private key.
 * Path: xpub → m/0/index (external chain).
 * Requires both LIQUID_XPUB and LIQUID_MASTER_BLINDING_KEY to be set.
 */
export function deriveLiquidAddressAndKey(
  xpub: string,
  masterBlindingKeyHex: string,
  index: number,
): { address: string; blindingPrivKey: Buffer } {
  const masterBlindingKey = Buffer.from(masterBlindingKeyHex, 'hex');
  const root = bip32.fromBase58(xpub);
  const child = root.derive(0).derive(index);
  const pubkey = Buffer.from(child.publicKey);

  const p2wpkh = liquid.payments.p2wpkh({ pubkey, network: liquid.networks.liquid });

  // SLIP77 standard: HMAC-SHA256(key=masterBlindingKey, data=scriptPubKey)
  // Using raw pubkey was wrong — Satsails and other wallets use the script as HMAC input
  const blindingPrivKey = slip77BlindingPrivKey(masterBlindingKey, p2wpkh.output!);
  const blindingPubKey = Buffer.from(ecc.pointFromScalar(blindingPrivKey, true)!);

  const address = liquid.address.toConfidential(p2wpkh.address!, blindingPubKey);

  return { address, blindingPrivKey };
}

// Keep legacy signature for createPixCopiaCola which only needs the address
export function deriveLiquidAddress(xpub: string, masterBlindingKeyHex: string, index: number): string {
  return deriveLiquidAddressAndKey(xpub, masterBlindingKeyHex, index).address;
}

/**
 * Gets the next available HD address index — global max across ALL models using the xpub.
 * Prevents address reuse across PixCopiaCola, Boleto, BoletoBatch, MobileRecharge, BillPayment.
 */
export async function getNextAddressIndex(prismaClient: any): Promise<number> {
  const [r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.all([
    prismaClient.pixCopiaCola.aggregate({ _max: { liquidAddressIndex: true } }),
    prismaClient.boleto.aggregate({ _max: { liquidAddressIndex: true } }),
    prismaClient.boletoBatch.aggregate({ _max: { liquidAddressIndex: true } }),
    prismaClient.mobileRecharge.aggregate({ _max: { liquidAddressIndex: true } }),
    prismaClient.billPayment.aggregate({ _max: { liquidAddressIndex: true } }),
    (prismaClient as any).pinTopup?.aggregate({ _max: { liquidAddressIndex: true } }).catch(() => ({ _max: { liquidAddressIndex: null } })) ?? Promise.resolve({ _max: { liquidAddressIndex: null } }),
    (prismaClient as any).tvTopup?.aggregate({ _max: { liquidAddressIndex: true } }).catch(() => ({ _max: { liquidAddressIndex: null } })) ?? Promise.resolve({ _max: { liquidAddressIndex: null } }),
    prismaClient.toprecargasOrder.aggregate({ _max: { liquidAddressIndex: true } }),
  ]);
  const max = Math.max(
    r1._max?.liquidAddressIndex ?? -1,
    r2._max?.liquidAddressIndex ?? -1,
    r3._max?.liquidAddressIndex ?? -1,
    r4._max?.liquidAddressIndex ?? -1,
    r5._max?.liquidAddressIndex ?? -1,
    r6._max?.liquidAddressIndex ?? -1,
    r7._max?.liquidAddressIndex ?? -1,
    r8._max?.liquidAddressIndex ?? -1,
  );
  return max + 1;
}

export interface EsploraUtxo {
  txid: string;
  vout: number;
  status: { confirmed: boolean; block_height?: number };
  value: number | null;
  asset: string | null;
}

/**
 * Checks Esplora for a confirmed UTXO of the specified asset at the given confidential address.
 *
 * Security: validates both asset ID AND amount before accepting a payment.
 * A wrong asset sent to the address is silently ignored.
 *
 * Returns txid if a valid payment is found, null otherwise.
 */
export async function checkEsploraForAssetPayment(
  address: string,
  expectedUnits: number,
  assetId: string,
  blindingPrivKey: Buffer,
): Promise<string | null> {
  try {
    const utxoRes = await fetch(`${ESPLORA_BASE}/address/${address}/utxo`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!utxoRes.ok) {
      console.error(`[LiquidHD] Esplora UTXO ${utxoRes.status} for ${address}`);
      return null;
    }

    const utxos = await utxoRes.json() as EsploraUtxo[];

    // Fetch chain tip height when >1 confirmation is required.
    // Default (MIN=1): a confirmed UTXO already has >=1 block — no extra call needed.
    let tipHeight: number | null = null;
    if (MIN_LIQUID_CONFIRMATIONS > 1) {
      try {
        const tipRes = await fetch(`${ESPLORA_BASE}/blocks/tip/height`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (tipRes.ok) {
          const parsed = parseInt(await tipRes.text(), 10);
          if (Number.isFinite(parsed) && parsed > 0) tipHeight = parsed;
        }
      } catch {
        console.warn('[LiquidHD] Cannot fetch tip height — UTXOs requiring >1 confirmation skipped until available');
      }
    }

    const confirmedUtxos = utxos.filter(u => {
      if (!u.status.confirmed || !u.status.block_height || u.status.block_height <= 0) return false;
      if (MIN_LIQUID_CONFIRMATIONS <= 1) return true;
      if (tipHeight == null) return false; // conservative: cannot verify confirmation count
      const confirmations = tipHeight - u.status.block_height + 1;
      return confirmations >= MIN_LIQUID_CONFIRMATIONS;
    });

    if (confirmedUtxos.length === 0) return null;

    const zkp = await getZkp();
    const conf = new liquid.confidential.Confidential(zkp);

    for (const utxo of confirmedUtxos) {
      try {
        // Fetch raw tx to unblind the confidential output
        const txRes = await fetch(`${ESPLORA_BASE}/tx/${utxo.txid}/hex`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!txRes.ok) continue;

        const txHex = await txRes.text();
        const tx = liquid.Transaction.fromHex(txHex);
        const out = tx.outs[utxo.vout];

        const unblinded = conf.unblindOutputWithKey(out, blindingPrivKey);

        // Asset ID in liquidjs-lib is stored in reversed byte order vs display format
        const receivedAsset = Buffer.from(unblinded.asset).reverse().toString('hex');
        const receivedValue = Number(unblinded.value);

        // Critical: reject wrong asset — must match exactly
        if (receivedAsset !== assetId) {
          console.warn(`[LiquidHD] Wrong asset at ${address}: got ${receivedAsset}, expected ${assetId}`);
          continue;
        }

        if (receivedValue >= expectedUnits - AMOUNT_TOLERANCE) {
          const overpay = receivedValue - expectedUnits;
          if (overpay > AMOUNT_TOLERANCE) {
            console.warn(
              `[LiquidHD] Overpayment detected: received ${receivedValue} units, ` +
              `expected ${expectedUnits}, excess ${overpay} units (~${(overpay / 1e8).toFixed(8)}) ` +
              `asset ${receivedAsset} txid ${utxo.txid}`,
            );
          } else {
            console.log(
              `[LiquidHD] Confirmed: ${receivedValue} units (expected ${expectedUnits}) ` +
              `asset ${receivedAsset} txid ${utxo.txid}`,
            );
          }
          return utxo.txid;
        } else {
          console.warn(
            `[LiquidHD] Underpayment at ${address}: received ${receivedValue} units, ` +
            `expected ${expectedUnits} (tolerance ${AMOUNT_TOLERANCE}). Ignoring.`,
          );
        }
      } catch {
        // unblindOutputWithKey throws if key doesn't match — skip
      }
    }
    return null;
  } catch (err) {
    console.error('[LiquidHD] Esplora check error:', err);
    return null;
  }
}

/**
 * @deprecated Use checkEsploraForAssetPayment directly.
 * Kept for backward compatibility during migration.
 */
export async function checkEsploraForDepixPayment(
  address: string,
  expectedBrl: number,
  blindingPrivKey: Buffer,
): Promise<string | null> {
  const expectedUnits = Math.round(expectedBrl * 1e8);
  return checkEsploraForAssetPayment(address, expectedUnits, LIQUID_ASSET_IDS.DEPIX, blindingPrivKey);
}

export function isXpubConfigured(): boolean {
  const xpub = (process.env.LIQUID_XPUB || '').trim();
  const key = (process.env.LIQUID_MASTER_BLINDING_KEY || '').trim();
  return !!(xpub && key);
}

/** Currencies that support automatic HD-wallet address derivation. */
export const AUTO_MODE_CURRENCIES = new Set(['DEPIX', 'USDT', 'BTC']);
