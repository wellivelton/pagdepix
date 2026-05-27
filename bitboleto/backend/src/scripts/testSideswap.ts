// Run: npx ts-node src/scripts/testSideswap.ts
// Investigates which SideSwap endpoint handles DePix swaps.

process.env.SIDESWAP_WS_URL  = process.env.SIDESWAP_WS_URL  ?? 'wss://api.sideswap.io/json-rpc-ws';
process.env.SIDESWAP_TESTNET = process.env.SIDESWAP_TESTNET ?? 'false';

import '../loadEnv';
import { getSideSwapClient } from '../services/sideswap.service';

const LBTC  = '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d';
const DEPIX = '02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189';

async function waitReady(client: ReturnType<typeof getSideSwapClient>, ms = 10_000) {
  return new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('Connection timeout')), ms);
    const p = setInterval(() => {
      if (client.isReady()) { clearInterval(p); clearTimeout(t); res(); }
    }, 100);
  });
}

async function raw(client: ReturnType<typeof getSideSwapClient>, method: string, params: unknown) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`► ${method}  params: ${JSON.stringify(params)}`);
  try {
    const result = await client.sendRequest(method, params, 15_000);
    console.log(`◀ RAW RESPONSE:\n${JSON.stringify(result, null, 2)}`);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`◀ ERROR: ${msg}`);
    return null;
  }
}

async function main() {
  const client = getSideSwapClient();
  console.log(`[testSideswap] Connecting to ${process.env.SIDESWAP_WS_URL}...`);
  await waitReady(client);
  console.log('[testSideswap] ✅ Connected\n');

  // ── Step 1: raw calls ───────────────────────────────────────────────────────
  console.log('\n══════════════════ STEP 1 — RAW CALLS ══════════════════');

  await raw(client, 'server_status', {});
  await raw(client, 'assets', { embedded_icons: false });
  await raw(client, 'swap_price', {});

  // ── Step 2: DePix full object from assets ───────────────────────────────────
  console.log('\n══════════════════ STEP 2 — DEPIX FULL OBJECT ══════════════════');
  const assetsRes = await client.sendRequest<{ assets?: unknown[] }>('assets', { embedded_icons: false });
  const assets: any[] = (assetsRes as any)?.assets ?? [];

  const depix = assets.find((a: any) =>
    a.asset_id === DEPIX || /depix/i.test(a.ticker + (a.name ?? ''))
  );

  if (depix) {
    console.log('\n✅ DePix — COMPLETE OBJECT (all fields):');
    console.log(JSON.stringify(depix, null, 2));
    console.log('\nField list:', Object.keys(depix).join(', '));
  } else {
    console.log('❌ DePix not found in assets response');
  }

  // ── Step 3: attempt swap_price for DePix↔LBTC ──────────────────────────────
  console.log('\n══════════════════ STEP 3 — SWAP PRICE ATTEMPTS ══════════════════');

  // Variant A: send_bitcoins style (some SideSwap versions)
  await raw(client, 'swap_price', {
    send_asset: LBTC,
    recv_asset: DEPIX,
    send_amount: 1,
  });

  // Variant B: asset_pair object
  await raw(client, 'swap_price', {
    asset_pair: { base: LBTC, quote: DEPIX },
    amount: 1,
    trade_dir: 'Sell',
  });

  // Variant C: price_stream (some versions use this for stablecoins)
  await raw(client, 'price_stream', {
    asset: DEPIX,
    send_bitcoins: true,
    send_amount: 1,
  });

  // Variant D: price_stream recv direction
  await raw(client, 'price_stream', {
    asset: DEPIX,
    send_bitcoins: false,
    send_amount: 1,
  });

  // Variant E: market list_markets (already tried, but log raw)
  await raw(client, 'market', { list_markets: {} });

  // Variant F: peg_in / peg_out (some assets use this)
  await raw(client, 'peg', {
    peg_in: true,
    asset_id: DEPIX,
  });

  console.log('\n══════════════════ DONE ══════════════════\n');
  client.close();
  process.exit(0);
}

main().catch(e => {
  console.error('[testSideswap] FATAL:', e.message);
  process.exit(1);
});
