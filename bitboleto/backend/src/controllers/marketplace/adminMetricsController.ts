import { Request, Response } from 'express';
import { prisma } from '../../prisma';

/**
 * Admin: métricas resumidas do marketplace.
 */
export const getAdminMetrics = async (req: Request, res: Response) => {
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const [
      productsCount,
      productsPending,
      ordersCount,
      ordersPaid,
      sellersCount,
      disputesOpen,
      withdrawalsPending,
    ] = await Promise.all([
      prisma.product.count({ where: { status: 'APPROVED' } }),
      prisma.product.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.marketOrder.count(),
      prisma.marketOrder.count({ where: { paymentStatus: 'paid' } }),
      prisma.user.count({ where: { sellerProducts: { some: {} } } }),
      prisma.sellerOrder.count({ where: { disputeStatus: { not: null } } }),
      prisma.sellerWithdrawal.count({ where: { status: 'PENDING' } }),
    ]);

    const [revenueResult, platformFeesResult] = await Promise.all([
      prisma.marketOrder.aggregate({
        where: { paymentStatus: 'paid' },
        _sum: { totalAmount: true },
      }),
      prisma.sellerOrder.aggregate({
        where: { marketOrder: { paymentStatus: 'paid' } },
        _sum: { platformFixedFee: true },
      }),
    ]);

    const totalRevenue = revenueResult._sum?.totalAmount ?? 0;
    const totalPlatformFees = platformFeesResult._sum?.platformFixedFee ?? 0;

    res.json({
      products: { total: productsCount, pendingApproval: productsPending },
      orders: { total: ordersCount, paid: ordersPaid },
      sellers: sellersCount,
      disputes: { open: disputesOpen },
      withdrawals: { pending: withdrawalsPending },
      revenue: { total: totalRevenue, platformFees: totalPlatformFees },
    });
  } catch (error) {
    console.error('Erro ao buscar métricas:', error);
    res.status(500).json({ error: 'Erro' });
  }
};
