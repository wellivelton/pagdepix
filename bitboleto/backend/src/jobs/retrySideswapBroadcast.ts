import { prisma } from '../prisma';
import { getSideSwapClient, logSwapEvent } from '../services/sideswap.service';

const JOB_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const STALE_AFTER_MS  = 2 * 60 * 1000; // 2 min

async function retrySideswapBroadcast() {
  const staleThreshold = new Date(Date.now() - STALE_AFTER_MS);

  const staleSwaps = await prisma.sideswapSwap.findMany({
    where: {
      status: 'broadcasting',
      updatedAt: { lt: staleThreshold },
      rawPset: { not: null },
    },
  });

  if (staleSwaps.length === 0) return;

  console.log(`[retrySideswapBroadcast] ${staleSwaps.length} stale swap(s) found`);

  for (const swap of staleSwaps) {
    const signedPset = swap.rawPset;
    const rawQuote   = swap.rawQuote as any;
    const quoteId: number | null = rawQuote?.quoteId ?? null;

    if (!signedPset || !quoteId) {
      console.warn(`[retrySideswapBroadcast] Swap ${swap.id} missing pset or quoteId — skipping`);
      continue;
    }

    try {
      const result = await getSideSwapClient().sendRequest<{ txid: string }>('market', {
        taker_sign: { quote_id: quoteId, pset: signedPset },
      });

      const txid = (result as any).txid as string;

      await prisma.sideswapSwap.update({
        where: { id: swap.id },
        data: { status: 'completed', settleTxid: txid, updatedAt: new Date() },
      });
      await logSwapEvent(swap.id, 'broadcasting', 'completed', { txid, recovery: true });

      console.log(`[retrySideswapBroadcast] Swap ${swap.id} recovered — txid: ${txid}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isExpired = /expired|not found/i.test(msg);

      if (isExpired) {
        await prisma.sideswapSwap.update({
          where: { id: swap.id },
          data: {
            status: 'failed',
            errorMessage: 'quote_expired_after_signing',
            updatedAt: new Date(),
          },
        });
        await logSwapEvent(swap.id, 'broadcasting', 'failed', {
          error: 'quote_expired_after_signing',
          originalError: msg,
          recovery: true,
        });
        console.warn(`[retrySideswapBroadcast] Swap ${swap.id} quote expired — marked failed`);
      } else {
        console.error(`[retrySideswapBroadcast] Swap ${swap.id} retry failed:`, msg);
      }
    }
  }
}

export function startRetrySideswapBroadcast() {
  retrySideswapBroadcast().catch(e => console.error('[retrySideswapBroadcast]', e));
  setInterval(
    () => retrySideswapBroadcast().catch(e => console.error('[retrySideswapBroadcast]', e)),
    JOB_INTERVAL_MS,
  );
}
