/**
 * Sincroniza pagamentos do Marketplace com SwapVerse.
 * Suporta: MarketplaceOrder (legado) e MarketOrder (novo multi-vendedor).
 */

import { prisma } from '../prisma';
import { getDepixOrderStatus } from '../services/swapverse';
import { deliverOrder } from '../services/marketplace/delivery.service';
import { deliverOrderItemsForSellerOrder } from '../services/marketplace/deliveryV2.service';
import { notifyOrderPaid } from '../services/marketplace/orderNotification.service';

const JOB_INTERVAL_MS = 60 * 1000;
const MAX_AGE_DAYS = 7;
let intervalId: NodeJS.Timeout | null = null;

export async function runSyncMarketplacePayments(): Promise<void> {
  const since = new Date();
  since.setDate(since.getDate() - MAX_AGE_DAYS);

  // ---- Legado: MarketplaceOrder ----
  const legacyOrders = await prisma.marketplaceOrder.findMany({
    where: {
      paymentStatus: 'pending',
      swapverseOrderId: { not: null },
      createdAt: { gte: since },
    },
    take: 15,
  });

  for (const order of legacyOrders) {
    if (!order.swapverseOrderId) continue;
    try {
      const result = await getDepixOrderStatus(order.swapverseOrderId);
      if (!result.success || result.order?.status !== 'depix_sent') continue;

      await prisma.marketplaceOrder.update({
        where: { id: order.id },
        data: { paymentStatus: 'paid', paidAt: new Date() },
      });

      await prisma.product.update({
        where: { id: order.productId },
        data: {
          purchaseCount: { increment: 1 },
          totalRevenue: { increment: order.sellerReceives },
        },
      });

      const deliveryResult = await deliverOrder(order.id);
      if (deliveryResult.success) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        await prisma.marketplaceOrder.update({
          where: { id: order.id },
          data: {
            settlementStatus: 'locked',
            settlementAvailableAt: d,
          },
        });
      }
    } catch (e) {
      console.error('[Marketplace] Erro ao processar pedido legado', order.id, e);
    }
  }

  // ---- Novo: MarketOrder (multi-vendedor) ----
  const marketOrders = await prisma.marketOrder.findMany({
    where: {
      paymentStatus: 'pending',
      swapverseOrderId: { not: null },
      createdAt: { gte: since },
    },
    include: { sellerOrders: { include: { items: { include: { product: true, variant: true } } } } },
    take: 15,
  });

  for (const mo of marketOrders) {
    if (!mo.swapverseOrderId) continue;
    try {
      const result = await getDepixOrderStatus(mo.swapverseOrderId);
      if (!result.success || result.order?.status !== 'depix_sent') continue;

      await prisma.$transaction(async (tx) => {
        await tx.marketOrder.update({
          where: { id: mo.id },
          data: { paymentStatus: 'paid', paidAt: new Date(), orderStatus: 'PAID' },
        });

        for (const so of mo.sellerOrders) {
          await tx.sellerOrder.update({
            where: { id: so.id },
            data: { status: 'PAID' },
          });

          for (const item of so.items) {
            const qty = item.quantity;
            if (item.variantId) {
              await tx.productVariant.update({
                where: { id: item.variantId },
                data: { stock: { decrement: qty }, stockReserved: { decrement: qty } },
              });
            } else {
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: { decrement: qty }, stockReserved: { decrement: qty } },
              });
            }
            await tx.product.update({
              where: { id: item.productId },
              data: {
                purchaseCount: { increment: 1 },
                totalRevenue: { increment: item.unitPrice * item.quantity },
              },
            });
          }
        }
      });

      await notifyOrderPaid(mo.id);

      for (const so of mo.sellerOrders) {
        await deliverOrderItemsForSellerOrder(so.id);
      }
    } catch (e) {
      console.error('[Marketplace] Erro ao processar MarketOrder', mo.id, e);
    }
  }
}

export function startMarketplacePaymentsSync(): void {
  if (intervalId) return;
  runSyncMarketplacePayments();
  intervalId = setInterval(runSyncMarketplacePayments, JOB_INTERVAL_MS);
  console.log('[Marketplace] Job syncMarketplacePayments iniciado');
}

export function stopMarketplacePaymentsSync(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
