import { Request, Response } from 'express';
import { prisma } from '../../prisma';

/**
 * GET /marketplace/wishlist - Listar itens da wishlist do usuário.
 */
export const getWishlist = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const items = await prisma.wishlistItem.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { position: 'asc' } },
            seller: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (error) {
    console.error('Erro ao listar wishlist:', error);
    res.status(500).json({ error: 'Erro ao listar wishlist' });
  }
};

/**
 * POST /marketplace/wishlist - Adicionar produto à wishlist.
 */
export const addToWishlist = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  const { productId } = req.body || {};
  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ error: 'productId obrigatório' });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId, status: 'APPROVED' },
    });
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const item = await prisma.wishlistItem.upsert({
      where: {
        userId_productId: { userId, productId },
      },
      create: { userId, productId },
      update: {},
    });
    res.status(201).json(item);
  } catch (error) {
    console.error('Erro ao adicionar à wishlist:', error);
    res.status(500).json({ error: 'Erro ao adicionar à wishlist' });
  }
};

/**
 * DELETE /marketplace/wishlist/:productId - Remover produto da wishlist.
 */
export const removeFromWishlist = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  const productId = Array.isArray(req.params.productId) ? req.params.productId[0] : req.params.productId;
  if (!productId) return res.status(400).json({ error: 'productId obrigatório' });

  try {
    await prisma.wishlistItem.deleteMany({
      where: { userId, productId },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover da wishlist:', error);
    res.status(500).json({ error: 'Erro ao remover da wishlist' });
  }
};
