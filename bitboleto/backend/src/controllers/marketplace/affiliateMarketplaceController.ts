import { Request, Response } from 'express';
import { prisma } from '../../prisma';

/**
 * POST /marketplace/affiliate/link - Gerar link de afiliado para produto.
 * O link usa ?ref=COUPON_CODE (o couponCode do Affiliate).
 */
export const generateLink = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });

  const { productId, productSlug } = req.body as { productId?: string; productSlug?: string };
  const productIdentifier = productId || productSlug;
  if (!productIdentifier) {
    return res.status(400).json({ error: 'productId ou productSlug obrigatório' });
  }

  try {
    const affiliate = await prisma.affiliate.findUnique({
      where: { userId },
    });
    if (!affiliate || !affiliate.isActive) {
      return res.status(403).json({ error: 'Usuário não é afiliado ativo' });
    }

    const product = productId
      ? await prisma.product.findUnique({ where: { id: productId, status: 'APPROVED' } })
      : await prisma.product.findFirst({ where: { slug: productSlug, status: 'APPROVED' } });
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://example.com';
    const productPath = `/marketplace/product/${product.slug}`;
    const link = `${baseUrl}${productPath}?ref=${encodeURIComponent(affiliate.couponCode)}`;

    res.json({
      link,
      productId: product.id,
      productSlug: product.slug,
      ref: affiliate.couponCode,
    });
  } catch (error) {
    console.error('Erro ao gerar link:', error);
    res.status(500).json({ error: 'Erro ao gerar link' });
  }
};

/**
 * GET /marketplace/affiliate/earnings - Comissões de marketplace do afiliado.
 */
export const getMarketplaceEarnings = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const affiliate = await prisma.affiliate.findUnique({
      where: { userId },
    });
    if (!affiliate) {
      return res.status(403).json({ error: 'Usuário não é afiliado' });
    }

    const commissions = await prisma.affiliateMarketplaceCommission.findMany({
      where: { affiliateId: affiliate.id },
      include: {
        sellerOrder: {
          include: {
            marketOrder: { select: { id: true, createdAt: true } },
            items: { take: 3, include: { product: { select: { title: true, slug: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const total = commissions.reduce((acc, c) => acc + c.amount, 0);
    const byStatus = {
      PENDING: commissions.filter((c) => c.status === 'PENDING').reduce((a, c) => a + c.amount, 0),
      AVAILABLE: commissions.filter((c) => c.status === 'AVAILABLE').reduce((a, c) => a + c.amount, 0),
      PAID: commissions.filter((c) => c.status === 'PAID').reduce((a, c) => a + c.amount, 0),
    };

    res.json({
      commissions,
      summary: {
        total,
        ...byStatus,
      },
    });
  } catch (error) {
    console.error('Erro ao listar earnings:', error);
    res.status(500).json({ error: 'Erro ao listar earnings' });
  }
};
