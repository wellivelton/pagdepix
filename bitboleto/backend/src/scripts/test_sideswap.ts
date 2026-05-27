// Test SideSwap start_quotes variations
// Run: npx ts-node src/scripts/test_sideswap.ts

import '../loadEnv';
import { WebSocket } from 'ws';

const WS_URL = process.env.SIDESWAP_WS_URL || 'wss://api.sideswap.io/json-rpc-ws';

const DEPIX = '02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189';
const USDT  = 'ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2';

const ASSET_BF   = '7111f166d4f1858d5a87eedb0f4d59f3a2cc1b90fa3555145c30cd64fd1c4f30';
const VALUE_BF   = 'c94d6efa6f62f22ce9a1ae678bf8da2d6fef81a6559b37db6600960ec3d922e5';
const ASSET_BF_R = Buffer.from(ASSET_BF, 'hex').reverse().toString('hex');
const VALUE_BF_R = Buffer.from(VALUE_BF, 'hex').reverse().toString('hex');

const CHANGE_ADDR  = 'lq1qqtqsj3e9aten2agn9zjqwymtt7q2yad8kql4kuy872mja0rzmrwp04xs2kd2g4vfdy5s8hlsd5tw3wtgpy86yhuvvmxd26pmg';
const RECEIVE_ADDR = 'lq1qq0tm9r0f6yvty240q0sg48ywuwlzk4kkfvtsvdtn3f0trk9pz2hl4ympuzd0guvg6g74amj0wyzawpnnk82lvv7rfuukuf6ss';

type SendFn = (method: string, params: unknown) => Promise<unknown>;

function makeWsClient(): Promise<{ send: SendFn; close: () => void }> {
  const ws = new WebSocket(WS_URL);
  let id = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as any;
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
      else p.resolve(msg.result);
    }
  });
  const send: SendFn = (method, params) => new Promise((resolve, reject) => {
    const myId = id++;
    pending.set(myId, { resolve, reject });
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  const close = () => ws.close();
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve({ send, close }));
    ws.on('error', reject);
  });
}

async function tryQuote(label: string, send: SendFn, dir: string, assetType: string, utxos: unknown[]) {
  try {
    const res = await send('market', {
      start_quotes: {
        asset_pair: { base: USDT, quote: DEPIX },
        asset_type: assetType,
        amount: 200000000,
        trade_dir: dir,
        utxos,
        receive_address: RECEIVE_ADDR,
        change_address: CHANGE_ADDR,
      },
    });
    console.log(`  ✅ ${label} [${dir}+${assetType}]: ${JSON.stringify(res)}`);
    return true;
  } catch (e: any) {
    console.log(`  ❌ ${label} [${dir}+${assetType}]: ${e.message}`);
    return false;
  }
}

async function main() {
  const { send, close } = await makeWsClient();
  console.log('Connected to SideSwap');

  const base = { txid: 'a42e8818ebaeb57db54b3e93aff4918036aae0a702330c73d2238852cd220df6', vout: 1, value: 200000000, redeem_script: null };

  console.log('\n--- Sell direction (taker sells DePix=Quote) ---');
  await tryQuote('normal bf', send, 'Sell', 'Quote', [{ ...base, asset: DEPIX, asset_bf: ASSET_BF, value_bf: VALUE_BF }]);
  await tryQuote('reversed value_bf', send, 'Sell', 'Quote', [{ ...base, asset: DEPIX, asset_bf: ASSET_BF, value_bf: VALUE_BF_R }]);
  await tryQuote('reversed asset_bf', send, 'Sell', 'Quote', [{ ...base, asset: DEPIX, asset_bf: ASSET_BF_R, value_bf: VALUE_BF }]);
  await tryQuote('both reversed', send, 'Sell', 'Quote', [{ ...base, asset: DEPIX, asset_bf: ASSET_BF_R, value_bf: VALUE_BF_R }]);
  await tryQuote('asset_type=Base', send, 'Sell', 'Base', [{ ...base, asset: DEPIX, asset_bf: ASSET_BF, value_bf: VALUE_BF }]);

  console.log('\n--- Buy direction (buy USDt=Base using DePix=Quote) ---');
  await tryQuote('normal bf', send, 'Buy', 'Quote', [{ ...base, asset: DEPIX, asset_bf: ASSET_BF, value_bf: VALUE_BF }]);
  await tryQuote('asset_type=Base', send, 'Buy', 'Base', [{ ...base, asset: DEPIX, asset_bf: ASSET_BF, value_bf: VALUE_BF }]);

  close();
}

main().catch(console.error);
