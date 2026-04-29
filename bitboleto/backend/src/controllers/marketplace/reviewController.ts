import { Request, Response } from 'express';
import { prisma } from '../../prisma';

/**
 * Criar avaliação (apenas comprador que comprou o produto).
 * Aceita orderId (legacy MarketplaceOrder) ou orderItemId (OrderItem do MarketOrder).
 */
export const createReview = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { orderId, orderItemId, rating, comment } = req.body as {
    orderId?: string;
    orderItemId?: string;
    rating?: number;
    comment?: string;
  };

  try {
    if (rating == null) {
      return res.status(400).json({ error: 'rating é obrigatório' });
    }
    const ratingNum = parseInt(String(rating), 10);
    if (ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Rating deve ser entre 1 e 5' });
    }

    // Legacy: MarketplaceOrder
    if (orderId) {
      const order = await prisma.marketplaceOrder.findFirst({
        where: { id: orderId, buyerId: userId, paymentStatus: 'paid' },
        include: { product: true },
      });
      if (!order) return res.status(404).json({ error: 'Pedido não encontrado ou não pago' });

      const existing = await prisma.productReview.findUnique({
        where: { orderId },
      });
      if (existing) return res.status(400).json({ error: 'Você já avaliou este pedido' });

      const review = await prisma.productReview.create({
        data: {
          productId: order.productId,
          userId,
          orderId,
          rating: ratingNum,
          comment: typeof comment === 'string' ? comment.slice(0, 2000) : null,
        },
      });
      return res.status(201).json({ success: true, review });
    }

    // Novo: OrderItem (ProductReviewV2)
    if (orderItemId) {
      const orderItem = await prisma.orderItem.findFirst({
        where: { id: orderItemId },
        include: {
          sellerOrder: { include: { marketOrder: true } },
          product: true,
          review: true,
        },
      });
      if (!orderItem || orderItem.sellerOrder.marketOrder.buyerId !== userId) {
        return res.status(404).json({ error: 'Item não encontrado ou não é seu' });
      }
      if (orderItem.sellerOrder.marketOrder.paymentStatus !== 'paid') {
        return res.status(400).json({ error: 'Pedido ainda não foi pago' });
      }
      if (orderItem.review) {
        return res.status(400).json({ error: 'Você já avaliou este item' });
      }

      const review = await prisma.productReviewV2.create({
        data: {
          orderItemId,
          userId,
          productId: orderItem.productId,
          rating: ratingNum,
          comment: typeof comment === 'string' ? comment.slice(0, 2000) : null,
        },
      });
      return res.status(201).json({ success: true, review });
    }

    return res.status(400).json({ error: 'orderId ou orderItemId é obrigatório' });
  } catch (error) {
    console.error('Erro ao criar avaliação:', error);
    res.status(500).json({ error: 'Erro ao criar avaliação' });
  }
};

/**
 * Listar avaliações aprovadas de um produto (público).
 */
function param(id: string | string[] | undefined): string | undefined {
  return Array.isArray(id) ? id[0] : id;
}

export const getProductReviews = async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const { page = '1', limit = '10' } = req.query;

  try {
    if (!productId) return res.status(400).json({ error: 'productId obrigatório' });
    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const [reviews, total] = await Promise.all([
      prisma.productReview.findMany({
        where: { productId, isApproved: true },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.productReview.count({ where: { productId, isApproved: true } }),
    ]);
    res.json({ reviews, pagination: { page: pageNum, limit: limitNum, total } });
  } catch (error) {
    console.error('Erro ao listar avaliações:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: listar avaliações pendentes.
 */
export const adminListReviews = async (req: Request, res: Response) => {
  const { page = '1', limit = '20', status = 'pending' } = req.query;

  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const isApprovedFilter = status === 'pending' ? false : status === 'approved' ? true : undefined;

    const [legacyReviews, v2Reviews, legacyTotal, v2Total] = await Promise.all([
      prisma.productReview.findMany({
        where: isApprovedFilter !== undefined ? { isApproved: isApprovedFilter } : {},
        include: {
          user: { select: { name: true, email: true } },
          product: { select: { title: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.productReviewV2.findMany({
        where: isApprovedFilter !== undefined ? { isApproved: isApprovedFilter } : {},
        include: {
          user: { select: { name: true, email: true } },
          product: { select: { title: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.productReview.count({ where: isApprovedFilter !== undefined ? { isApproved: isApprovedFilter } : {} }),
      prisma.productReviewV2.count({ where: isApprovedFilter !== undefined ? { isApproved: isApprovedFilter } : {} }),
    ]);

    const reviews = [
      ...legacyReviews.map((r: any) => ({ ...r, _source: 'legacy' })),
      ...v2Reviews.map((r: any) => ({ ...r, _source: 'v2' })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = legacyTotal + v2Total;
    res.json({
      reviews,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('Erro ao listar avaliações:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: aprovar avaliação (ProductReview ou ProductReviewV2).
 */
export const approveReview = async (req: Request, res: Response) => {
  const reviewId = param(req.params.reviewId);
  const adminId = (req as any).userId;

  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    if (!reviewId) return res.status(400).json({ error: 'reviewId obrigatório' });

    const legacy = await prisma.productReview.findUnique({ where: { id: reviewId } });
    if (legacy) {
      const review = await prisma.productReview.update({
        where: { id: reviewId },
        data: { isApproved: true, approvedAt: new Date(), approvedBy: adminId, rejectionReason: null },
      });
      const agg = await prisma.productReview.aggregate({
        where: { productId: review.productId, isApproved: true },
        _avg: { rating: true },
        _count: true,
      });
      await prisma.product.update({
        where: { id: review.productId },
        data: { averageRating: agg._avg.rating ?? undefined, reviewCount: agg._count },
      });
      return res.json({ success: true, review, _source: 'legacy' });
    }

    const v2 = await prisma.productReviewV2.findUnique({ where: { id: reviewId } });
    if (v2) {
      const review = await prisma.productReviewV2.update({
        where: { id: reviewId },
        data: { isApproved: true, approvedAt: new Date(), approvedBy: adminId, rejectionReason: null },
      });
      const [legacyAgg, v2Agg] = await Promise.all([
        prisma.productReview.aggregate({
          where: { productId: review.productId, isApproved: true },
          _avg: { rating: true },
          _count: true,
        }),
        prisma.productReviewV2.aggregate({
          where: { productId: review.productId, isApproved: true },
          _avg: { rating: true },
          _count: true,
        }),
      ]);
      const totalCount = legacyAgg._count + v2Agg._count;
      const avgRating =
        totalCount > 0
          ? ((legacyAgg._avg.rating ?? 0) * legacyAgg._count + (v2Agg._avg.rating ?? 0) * v2Agg._count) / totalCount
          : null;
      await prisma.product.update({
        where: { id: review.productId },
        data: { averageRating: avgRating ?? undefined, reviewCount: totalCount },
      });
      return res.json({ success: true, review, _source: 'v2' });
    }

    return res.status(404).json({ error: 'Avaliação não encontrada' });
  } catch (error) {
    console.error('Erro ao aprovar avaliação:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: rejeitar avaliação.
 */
export const rejectReview = async (req: Request, res: Response) => {
  const reviewId = param(req.params.reviewId);
  const { reason } = req.body;

  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    if (!reviewId) return res.status(400).json({ error: 'reviewId obrigatório' });

    const legacy = await prisma.productReview.findUnique({ where: { id: reviewId } });
    if (legacy) {
      const review = await prisma.productReview.update({
        where: { id: reviewId },
        data: { rejectionReason: reason || null },
      });
      return res.json({ success: true, review });
    }

    const v2 = await prisma.productReviewV2.findUnique({ where: { id: reviewId } });
    if (v2) {
      const review = await prisma.productReviewV2.update({
        where: { id: reviewId },
        data: { rejectionReason: reason || null },
      });
      return res.json({ success: true, review });
    }

    return res.status(404).json({ error: 'Avaliação não encontrada' });
  } catch (error) {
    console.error('Erro ao rejeitar avaliação:', error);
    res.status(500).json({ error: 'Erro' });
  }
};
