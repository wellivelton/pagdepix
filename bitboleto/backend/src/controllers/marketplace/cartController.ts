import { Request, Response } from 'express';
import * as cartService from '../../services/marketplace/cart.service';
import * as checkoutCartService from '../../services/marketplace/checkoutCart.service';

export const getCart = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const cart = await cartService.getCart(userId);
    return res.json(cart);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Erro ao buscar carrinho' });
  }
};

export const addToCart = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  const { productId, variantId, quantity = 1 } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'productId obrigatório' });
  try {
    const item = await cartService.addToCart(userId, {
      productId,
      variantId: variantId || undefined,
      quantity: Math.max(1, parseInt(String(quantity), 10) || 1),
    });
    return res.status(201).json(item);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Erro ao adicionar' });
  }
};

export const updateItem = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  const itemId = typeof req.params.itemId === 'string' ? req.params.itemId : (req.params.itemId as string[])?.[0] ?? '';
  const quantity = parseInt(String(req.body?.quantity), 10);
  if (!itemId || isNaN(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'itemId e quantity válidos obrigatórios' });
  }
  try {
    const item = await cartService.updateCartItem(userId, itemId, quantity);
    return res.json(item);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Erro ao atualizar' });
  }
};

export const removeItem = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  const itemId = typeof req.params.itemId === 'string' ? req.params.itemId : (req.params.itemId as string[])?.[0] ?? '';
  if (!itemId) return res.status(400).json({ error: 'itemId obrigatório' });
  try {
    await cartService.removeFromCart(userId, itemId);
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Erro ao remover' });
  }
};

/**
 * POST /marketplace/checkout/cart
 */
export const checkoutCart = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  const { globalCouponCode, affiliateCode } = req.body || {};
  const ip = (req as any).ip || req.socket?.remoteAddress;
  try {
    const result = await checkoutCartService.createOrderFromCart({
      buyerId: userId,
      globalCouponCode: typeof globalCouponCode === 'string' ? globalCouponCode : undefined,
      affiliateCode: typeof affiliateCode === 'string' ? affiliateCode : undefined,
      ip,
    });
    return res.status(201).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Erro no checkout' });
  }
};
