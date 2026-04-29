/**
 * Serviço do carrinho multi-vendedor.
 */

import { prisma } from '../../prisma';

export interface CartItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

export async function getOrCreateCart(buyerId: string) {
  let cart = await prisma.cart.findUnique({ where: { buyerId } });
  if (!cart) {
    cart = await prisma.cart.create({ data: { buyerId } });
  }
  return cart;
}

export async function addToCart(buyerId: string, input: CartItemInput) {
  const { productId, variantId, quantity } = input;
  if (quantity < 1) throw new Error('Quantidade inválida');

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: variantId ? true : false },
  });
  if (!product || product.status !== 'APPROVED') {
    throw new Error('Produto não encontrado ou não aprovado');
  }

  const stock = variantId
    ? (await prisma.productVariant.findUnique({ where: { id: variantId } }))?.stock ?? 0
    : product.stock;
  const reserved = variantId ? 0 : product.stockReserved;

  if (stock - reserved < quantity) {
    throw new Error('Estoque insuficiente');
  }

  const cart = await getOrCreateCart(buyerId);

  const existing = await prisma.cartItem.findFirst({
    where: {
      cartId: cart.id,
      productId,
      variantId: variantId || null,
    },
  });

  if (existing) {
    const newQty = existing.quantity + quantity;
    if (stock - reserved < newQty) throw new Error('Estoque insuficiente');
    return prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: newQty },
      include: { product: { select: { id: true, title: true, priceInDepix: true, sellerId: true } } },
    });
  }

  return prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId,
      variantId: variantId || undefined,
      quantity,
    },
    include: { product: { select: { id: true, title: true, priceInDepix: true, sellerId: true } } },
  });
}

export async function updateCartItem(buyerId: string, itemId: string, quantity: number) {
  if (quantity < 1) throw new Error('Quantidade mínima 1');
  const cart = await getOrCreateCart(buyerId);
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
    include: { product: true },
  });
  if (!item) throw new Error('Item não encontrado');

  const stock = item.variantId
    ? (await prisma.productVariant.findUnique({ where: { id: item.variantId } }))?.stock ?? 0
    : item.product.stock;
  const reserved = item.variantId ? 0 : item.product.stockReserved;
  if (stock - reserved < quantity) throw new Error('Estoque insuficiente');

  return prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
    include: { product: { select: { id: true, title: true, priceInDepix: true } } },
  });
}

export async function removeFromCart(buyerId: string, itemId: string) {
  const cart = await getOrCreateCart(buyerId);
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
  });
  if (!item) throw new Error('Item não encontrado');
  await prisma.cartItem.delete({ where: { id: itemId } });
  return { success: true };
}

export async function getCart(buyerId: string) {
  const cart = await getOrCreateCart(buyerId);
  return prisma.cart.findUnique({
    where: { id: cart.id },
    include: {
      items: {
        include: {
          variant: { select: { id: true, name: true, priceInDepix: true } },
          product: {
            select: {
              id: true,
              title: true,
              slug: true,
              priceInDepix: true,
              sellerId: true,
              deliveryType: true,
              coverImageUrl: true,
            },
          },
        },
      },
    },
  });
}
