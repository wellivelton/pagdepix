// Run: npx ts-node src/scripts/test-sideswap-markets.ts
import '../loadEnv';
import { getSideSwapClient, listMarkets } from '../services/sideswap.service';

async function main() {
  console.log('[test] Connecting to SideSwap testnet...');
  const client = getSideSwapClient();

  // Wait for connection
  await new Promise<void>((res, rej) => {
    const deadline = setTimeout(() => rej(new Error('Connection timeout 10s')), 10_000);
    const poll = setInterval(() => {
      if (client.isReady()) {
        clearInterval(poll);
        clearTimeout(deadline);
        res();
      }
    }, 100);
  });

  console.log('[test] Connected. Fetching markets...');
  const { assets, markets } = await listMarkets();

  console.log(`\n[test] Total assets: ${assets.length}`);
  console.log(`[test] Total markets: ${markets.length}`);

  console.log('\n[test] All asset tickers:');
  console.log(assets.map(a => `  ${a.ticker} (${a.name}) — ${a.asset_id}`).join('\n'));

  const depixAssets = assets.filter(a =>
    /depix|brlx|brl|dex/i.test(a.ticker + a.name)
  );

  if (depixAssets.length > 0) {
    console.log('\n✅ DePix-related assets FOUND:');
    console.log(JSON.stringify(depixAssets, null, 2));

    const depixIds = new Set(depixAssets.map(a => a.asset_id));
    const depixMarkets = markets.filter(m =>
      depixIds.has(m.asset_pair.base) || depixIds.has(m.asset_pair.quote)
    );
    if (depixMarkets.length > 0) {
      console.log('\n✅ Markets with DePix:');
      console.log(JSON.stringify(depixMarkets, null, 2));
    } else {
      console.warn('\n⚠️  DePix asset exists but NO market pairs found for it');
    }
  } else {
    console.warn('\n❌ DePix NOT found on testnet');
    console.log('[test] Proceeding with L-BTC/USDt pair for testing');
  }

  client.close();
  process.exit(0);
}

main().catch(e => {
  console.error('[test] FAILED:', e.message);
  process.exit(1);
});
