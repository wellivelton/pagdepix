import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import { createNotification } from '../../services/marketplace/orderNotification.service';

/**
 * Comprador ou vendedor abre disputa.
 * Aceita orderId (MarketplaceOrder legado) ou sellerOrderId (SellerOrder do MarketOrder).
 */
export const openDispute = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { orderId, sellerOrderId, reason } = req.body as { orderId?: string; sellerOrderId?: string; reason?: string };

  try {
    if (!reason?.trim()) return res.status(400).json({ error: 'reason é obrigatório' });

    // Legacy: MarketplaceOrder
    if (orderId) {
      const order = await prisma.marketplaceOrder.findFirst({
        where: {
          id: orderId,
          OR: [{ buyerId: userId }, { sellerId: userId }],
          paymentStatus: 'paid',
        },
      });
      if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
      if (order.disputeStatus) return res.status(400).json({ error: 'Pedido já possui disputa aberta' });

      const updated = await prisma.marketplaceOrder.update({
        where: { id: orderId },
        data: {
          disputeStatus: 'open',
          disputeReason: reason.trim().slice(0, 2000),
          disputeOpenedAt: new Date(),
        },
      });
      return res.json({ success: true, order: updated });
    }

    // Novo: SellerOrder (MarketOrder)
    if (sellerOrderId) {
      const sellerOrder = await prisma.sellerOrder.findFirst({
        where: { id: sellerOrderId },
        include: { marketOrder: true },
      });
      if (!sellerOrder) return res.status(404).json({ error: 'Pedido não encontrado' });
      const isBuyer = sellerOrder.marketOrder.buyerId === userId;
      const isSeller = sellerOrder.sellerId === userId;
      if (!isBuyer && !isSeller) return res.status(403).json({ error: 'Acesso negado' });
      if (sellerOrder.marketOrder.paymentStatus !== 'paid') {
        return res.status(400).json({ error: 'Pedido ainda não foi pago' });
      }
      if (sellerOrder.disputeStatus) return res.status(400).json({ error: 'Este pedido já possui disputa aberta' });

      // Bloquear saldo disponível (mover de available para locked)
      if (sellerOrder.settlementStatus === 'available') {
        await prisma.sellerBalance.update({
          where: { sellerId: sellerOrder.sellerId },
          data: {
            availableBalance: { decrement: sellerOrder.sellerReceives },
            lockedBalance: { increment: sellerOrder.sellerReceives },
          },
        });
      }

      const updated = await prisma.sellerOrder.update({
        where: { id: sellerOrderId },
        data: {
          disputeStatus: 'open',
          disputeReason: reason.trim().slice(0, 2000),
          disputeOpenedAt: new Date(),
          settlementStatus: 'locked',
        },
      });

      // Notificar vendedor
      await createNotification({
        userId: sellerOrder.sellerId,
        type: 'DISPUTE_OPENED',
        marketOrderId: sellerOrder.marketOrderId,
        title: 'Disputa aberta',
        body: `Uma disputa foi aberta no seu pedido #${sellerOrderId.slice(0, 8)}. Responda em breve.`,
        channel: 'inapp',
      });

      return res.json({ success: true, order: updated });
    }

    return res.status(400).json({ error: 'orderId ou sellerOrderId é obrigatório' });
  } catch (error) {
    console.error('Erro ao abrir disputa:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Vendedor: responder disputa de um SellerOrder.
 */
export const respondToDispute = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { sellerOrderId, response } = req.body as { sellerOrderId?: string; response?: string };

  try {
    if (!sellerOrderId || !response?.trim()) {
      return res.status(400).json({ error: 'sellerOrderId e response são obrigatórios' });
    }

    const sellerOrder = await prisma.sellerOrder.findFirst({
      where: { id: sellerOrderId, sellerId: userId },
      include: { marketOrder: true },
    });
    if (!sellerOrder) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (sellerOrder.disputeStatus !== 'open') {
      return res.status(400).json({ error: 'Disputa não está aberta' });
    }

    const updated = await prisma.sellerOrder.update({
      where: { id: sellerOrderId },
      data: {
        disputeSellerResponse: response.trim().slice(0, 2000),
        disputeSellerRespondedAt: new Date(),
      },
    });

    // Notificar comprador
    await createNotification({
      userId: sellerOrder.marketOrder.buyerId,
      type: 'DISPUTE_SELLER_RESPONSE',
      marketOrderId: sellerOrder.marketOrderId,
      title: 'Vendedor respondeu à disputa',
      body: 'O vendedor respondeu à sua disputa. Aguarde a decisão do suporte.',
      channel: 'inapp',
    });

    return res.json({ success: true, order: updated });
  } catch (error) {
    console.error('Erro ao responder disputa:', error);
    res.status(500).json({ error: 'Erro ao responder disputa' });
  }
};

/**
 * Admin: listar disputas (legacy MarketplaceOrder + SellerOrder).
 */
export const listDisputes = async (req: Request, res: Response) => {
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const { status = 'open' } = req.query;
    const where: any = { disputeStatus: { not: null } };
    if (status === 'open') where.disputeStatus = 'open';
    if (status === 'resolved') where.disputeStatus = { in: ['resolved_buyer', 'resolved_seller', 'resolved_split'] };

    const [legacyOrders, sellerOrders] = await Promise.all([
      prisma.marketplaceOrder.findMany({
        where,
        include: {
          product: { select: { title: true, slug: true } },
          buyer: { select: { name: true, email: true } },
          seller: { select: { name: true, email: true } },
        },
        orderBy: { disputeOpenedAt: 'desc' },
      }),
      prisma.sellerOrder.findMany({
        where,
        include: {
          marketOrder: { include: { buyer: { select: { name: true, email: true } } } },
          seller: { select: { name: true, email: true } },
          items: { include: { product: { select: { title: true, slug: true } } }, take: 1 },
        },
        orderBy: { disputeOpenedAt: 'desc' },
      }),
    ]);

    const normalizedLegacy = legacyOrders.map((o) => ({
      ...o,
      _type: 'legacy' as const,
    }));
    const normalizedNew = sellerOrders.map((o) => ({
      ...o,
      _type: 'seller_order' as const,
      buyer: o.marketOrder?.buyer,
    }));

    res.json({ legacy: normalizedLegacy, sellerOrders: normalizedNew });
  } catch (error) {
    console.error('Erro ao listar disputas:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: resolver disputa.
 */
function param(id: string | string[] | undefined): string | undefined {
  return Array.isArray(id) ? id[0] : id;
}

export const resolveDispute = async (req: Request, res: Response) => {
  const adminId = (req as any).userId;
  const orderId = param(req.params.orderId);
  const { resolution, adminNotes, type } = req.body as {
    resolution?: string;
    adminNotes?: string;
    type?: 'legacy' | 'seller_order';
  };

  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });
    if (!['resolved_buyer', 'resolved_seller', 'resolved_split'].includes(resolution || '')) {
      return res.status(400).json({ error: 'resolution inválida' });
    }

    // SellerOrder path
    if (type === 'seller_order') {
      const sellerOrder = await prisma.sellerOrder.findUnique({
        where: { id: orderId },
        include: { marketOrder: { include: { buyer: true } } },
      });
      if (!sellerOrder || sellerOrder.disputeStatus !== 'open') {
        return res.status(404).json({ error: 'Disputa não encontrada' });
      }

      await prisma.$transaction(async (tx) => {
        // Desbloquear saldo do vendedor
        if (sellerOrder.settlementStatus === 'locked') {
          if (resolution === 'resolved_seller') {
            // Crédito volta para disponível
            await tx.sellerBalance.update({
              where: { sellerId: sellerOrder.sellerId },
              data: {
                lockedBalance: { decrement: sellerOrder.sellerReceives },
                availableBalance: { increment: sellerOrder.sellerReceives },
              },
            });
          } else if (resolution === 'resolved_buyer') {
            // Estorno: remove do locked sem creditar no available
            await tx.sellerBalance.update({
              where: { sellerId: sellerOrder.sellerId },
              data: { lockedBalance: { decrement: sellerOrder.sellerReceives } },
            });
          } else if (resolution === 'resolved_split') {
            // Metade para cada lado
            const half = Math.round((sellerOrder.sellerReceives / 2) * 100) / 100;
            await tx.sellerBalance.update({
              where: { sellerId: sellerOrder.sellerId },
              data: {
                lockedBalance: { decrement: sellerOrder.sellerReceives },
                availableBalance: { increment: half },
              },
            });
          }
        }

        await tx.sellerOrder.update({
          where: { id: orderId },
          data: {
            disputeStatus: resolution,
            disputeResolvedAt: new Date(),
            disputeResolvedBy: adminId,
            disputeAdminNotes: adminNotes?.slice(0, 2000) || null,
            settlementStatus: resolution === 'resolved_seller' ? 'available' : 'refunded',
          },
        });
      });

      // Notificar ambas as partes
      await Promise.all([
        createNotification({
          userId: sellerOrder.sellerId,
          type: 'DISPUTE_RESOLVED',
          marketOrderId: sellerOrder.marketOrderId,
          title: 'Disputa resolvida',
          body: `A disputa do pedido #${orderId.slice(0, 8)} foi resolvida pelo suporte.`,
          channel: 'inapp',
        }),
        createNotification({
          userId: sellerOrder.marketOrder.buyerId,
          type: 'DISPUTE_RESOLVED',
          marketOrderId: sellerOrder.marketOrderId,
          title: 'Disputa resolvida',
          body: `A disputa do seu pedido #${orderId.slice(0, 8)} foi resolvida pelo suporte.`,
          channel: 'inapp',
        }),
      ]);

      return res.json({ success: true });
    }

    // Legacy MarketplaceOrder path
    const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
    if (!order || !order.disputeStatus || order.disputeStatus !== 'open') {
      return res.status(404).json({ error: 'Disputa não encontrada' });
    }

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: {
        disputeStatus: resolution,
        disputeResolvedAt: new Date(),
        disputeResolvedBy: adminId,
        disputeAdminNotes: adminNotes?.slice(0, 2000) || null,
      },
    });

    const updated = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: { product: true, buyer: true, seller: true },
    });
    res.json({ success: true, order: updated });
  } catch (error) {
    console.error('Erro ao resolver disputa:', error);
    res.status(500).json({ error: 'Erro' });
  }
};
