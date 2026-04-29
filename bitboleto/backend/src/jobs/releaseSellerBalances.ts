/**
 * Libera saldos D+1/D+7: pedidos com settlementAvailableAt <= now e status locked
 * viram available e o valor é creditado em SellerBalance.availableBalance.
 * Suporta: MarketplaceOrder (legado) e SellerOrder (novo).
 */

import { prisma } from '../prisma';

const JOB_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos
let intervalId: NodeJS.Timeout | null = null;

export async function runReleaseSellerBalances(): Promise<void> {
  const now = new Date();

  // ---- Legado: MarketplaceOrder ----
  const legacyOrders = await prisma.marketplaceOrder.findMany({
    where: {
      settlementStatus: 'locked',
      settlementAvailableAt: { lte: now },
      disputeStatus: null,
      paymentStatus: 'paid',
    },
  });

  for (const order of legacyOrders) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.marketplaceOrder.update({
          where: { id: order.id },
          data: { settlementStatus: 'available' },
        });
        const balance = await tx.sellerBalance.upsert({
          where: { sellerId: order.sellerId },
          create: {
            sellerId: order.sellerId,
            availableBalance: order.sellerReceives,
            totalEarned: order.sellerReceives,
          },
          update: {
            availableBalance: { increment: order.sellerReceives },
            totalEarned: { increment: order.sellerReceives },
          },
        });
        await tx.sellerBalanceTransaction.create({
          data: {
            sellerId: order.sellerId,
            type: 'SALE_CREDIT',
            amount: order.sellerReceives,
            balanceAfter: balance.availableBalance,
            referenceType: 'MarketplaceOrder',
            referenceId: order.id,
            description: `Liberação de venda #${order.id}`,
          },
        });
      });
    } catch (e) {
      console.error('[Marketplace] Erro ao liberar saldo pedido legado', order.id, e);
    }
  }

  // ---- Novo: SellerOrder ----
  const sellerOrders = await prisma.sellerOrder.findMany({
    where: {
      settlementStatus: 'locked',
      settlementAvailableAt: { lte: now },
      disputeStatus: null,
      marketOrder: { paymentStatus: 'paid' },
      status: { in: ['COMPLETED', 'PAID', 'PROCESSING'] },
    },
  });

  for (const so of sellerOrders) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.sellerOrder.update({
          where: { id: so.id },
          data: { settlementStatus: 'available', settlementPaidAt: new Date() },
        });
        const balance = await tx.sellerBalance.upsert({
          where: { sellerId: so.sellerId },
          create: {
            sellerId: so.sellerId,
            availableBalance: so.sellerReceives,
            totalEarned: so.sellerReceives,
          },
          update: {
            availableBalance: { increment: so.sellerReceives },
            totalEarned: { increment: so.sellerReceives },
          },
        });
        await tx.sellerBalanceTransaction.create({
          data: {
            sellerId: so.sellerId,
            type: 'SALE_CREDIT',
            amount: so.sellerReceives,
            balanceAfter: balance.availableBalance,
            referenceType: 'SellerOrder',
            referenceId: so.id,
            description: `Liberação de venda #${so.id}`,
          },
        });
        if (so.affiliateId && so.affiliateCommission > 0) {
          const existing = await tx.affiliateMarketplaceCommission.findUnique({
            where: { affiliateId_sellerOrderId: { affiliateId: so.affiliateId, sellerOrderId: so.id } },
          });
          if (!existing) {
            await tx.affiliateMarketplaceCommission.create({
              data: {
                affiliateId: so.affiliateId,
                sellerOrderId: so.id,
                amount: so.affiliateCommission,
                status: 'AVAILABLE',
                availableAt: new Date(),
              },
            });
            await tx.affiliate.update({
              where: { id: so.affiliateId },
              data: {
                balance: { increment: so.affiliateCommission },
                totalEarned: { increment: so.affiliateCommission },
              },
            });
          }
        }
      });
    } catch (e) {
      console.error('[Marketplace] Erro ao liberar saldo SellerOrder', so.id, e);
    }
  }
}

export function startReleaseSellerBalances(): void {
  if (intervalId) return;
  runReleaseSellerBalances();
  intervalId = setInterval(runReleaseSellerBalances, JOB_INTERVAL_MS);
  console.log('[Marketplace] Job releaseSellerBalances iniciado');
}

export function stopReleaseSellerBalances(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
