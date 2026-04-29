/**
 * Libera reserva de estoque de MarketOrders com pagamento expirado.
 * Verifica status na SwapVerse; se não for depix_sent e pedido > 15 min, libera.
 */

import { prisma } from '../prisma';
import { getDepixOrderStatus } from '../services/swapverse';

const JOB_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const MIN_AGE_MS = 15 * 60 * 1000; // 15 min
let intervalId: NodeJS.Timeout | null = null;

export async function runReleaseExpiredReservations(): Promise<void> {
  const minAge = new Date(Date.now() - MIN_AGE_MS);

  const orders = await prisma.marketOrder.findMany({
    where: {
      paymentStatus: 'pending',
      orderStatus: 'AWAITING_PAYMENT',
      swapverseOrderId: { not: null },
      createdAt: { lte: minAge },
    },
    include: { sellerOrders: { include: { items: true } } },
    take: 20,
  });

  for (const mo of orders) {
    if (!mo.swapverseOrderId) continue;
    try {
      const result = await getDepixOrderStatus(mo.swapverseOrderId);
      if (!result.success) continue;
      const status = (result.order?.status || '').toLowerCase();
      if (status === 'depix_sent') continue; // Pago
      if (status === 'pending') continue; // Ainda pode pagar

      // Expired, cancelled, failed, etc - liberar reserva
      await prisma.$transaction(async (tx) => {
        for (const so of mo.sellerOrders) {
          for (const item of so.items) {
            const qty = item.quantity;
            if (item.variantId) {
              await tx.productVariant.update({
                where: { id: item.variantId },
                data: { stockReserved: { decrement: qty } },
              });
            } else {
              await tx.product.update({
                where: { id: item.productId },
                data: { stockReserved: { decrement: qty } },
              });
            }
          }
        }
        await tx.marketOrder.update({
          where: { id: mo.id },
          data: { orderStatus: 'CANCELLED' },
        });
      });
    } catch (e) {
      console.error('[Marketplace] Erro ao liberar reserva expirada', mo.id, e);
    }
  }
}

export function startReleaseExpiredReservations(): void {
  if (intervalId) return;
  runReleaseExpiredReservations();
  intervalId = setInterval(runReleaseExpiredReservations, JOB_INTERVAL_MS);
  console.log('[Marketplace] Job releaseExpiredReservations iniciado');
}
