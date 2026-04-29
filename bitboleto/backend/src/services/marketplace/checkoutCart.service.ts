/**
 * Checkout a partir do carrinho - cria MarketOrder + SellerOrders + OrderItems.
 */

import { prisma } from '../../prisma';
import { calculateMarketplaceFees } from '../../utils/marketplaceFees';
import { generateDepixQr } from '../swapverse';
import { checkFraudBeforeCheckout } from './fraudFlag.service';

export interface CheckoutCartInput {
  buyerId: string;
  globalCouponCode?: string;
  affiliateCode?: string;
  ip?: string;
}

export async function createOrderFromCart(input: CheckoutCartInput) {
  const { buyerId, globalCouponCode, affiliateCode, ip } = input;

  const fraudCheck = await checkFraudBeforeCheckout({ buyerId, ip });
  if (!fraudCheck.allowed) throw new Error(fraudCheck.reason || 'Checkout bloqueado');

  const cart = await prisma.cart.findUnique({
    where: { buyerId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              sellerId: true,
              title: true,
              priceInDepix: true,
              deliveryType: true,
              stock: true,
              stockReserved: true,
              allowAffiliates: true,
              affiliateCommissionPercent: true,
            },
          },
          variant: { select: { id: true, priceInDepix: true, stock: true, stockReserved: true } },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    throw new Error('Carrinho vazio');
  }

  let affiliateId: string | null = null;
  if (affiliateCode && typeof affiliateCode === 'string') {
    const aff = await prisma.affiliate.findFirst({
      where: { couponCode: affiliateCode.trim().toUpperCase(), isActive: true },
    });
    if (aff) affiliateId = aff.id;
  }

  let globalDiscountPercent = 0;
  let globalCouponId: string | null = null;
  if (globalCouponCode) {
    const gc = await prisma.globalCoupon.findFirst({
      where: { code: globalCouponCode.toUpperCase(), isActive: true },
    });
    if (gc && (gc.maxUsage == null || gc.usageCount < gc.maxUsage) && (!gc.expiresAt || gc.expiresAt > new Date())) {
      globalDiscountPercent = gc.discountPercent ?? 0;
      globalCouponId = gc.id;
    }
  }

  const bySeller = new Map<
    string,
    Array<{
      item: (typeof cart.items)[0];
      unitPrice: number;
      qty: number;
    }>
  >();

  for (const item of cart.items) {
    const unitPrice = item.variant?.priceInDepix ?? item.product.priceInDepix;
    const stock = item.variant ? item.variant.stock - item.variant.stockReserved : item.product.stock - item.product.stockReserved;
    if (stock < item.quantity) {
      throw new Error(`Estoque insuficiente: ${item.product.title}`);
    }
    const sellerId = item.product.sellerId;
    if (!bySeller.has(sellerId)) bySeller.set(sellerId, []);
    bySeller.get(sellerId)!.push({ item, unitPrice, qty: item.quantity });
  }

  let totalAmount = 0;
  const sellerOrdersData: Array<{
    sellerId: string;
    subtotal: number;
    platformFixedFee: number;
    affiliateCommission: number;
    affiliateId: string | null;
    couponDiscount: number;
    sellerReceives: number;
    items: Array<{
      productId: string;
      variantId: string | null;
      quantity: number;
      unitPrice: number;
    }>;
  }> = [];

  for (const [sellerId, items] of bySeller) {
    let subtotal = 0;
    let affiliateCommissionPercent = 0;
    if (affiliateId) {
      const productsWithAffiliate = items.filter(({ item }) => item.product.allowAffiliates && (item.product.affiliateCommissionPercent ?? 0) > 0);
      if (productsWithAffiliate.length > 0) {
        const totalAll = items.reduce((s, { unitPrice, qty }) => s + unitPrice * qty, 0);
        affiliateCommissionPercent = totalAll > 0
          ? (productsWithAffiliate.reduce((s, { item, unitPrice, qty }) => s + (item.product.affiliateCommissionPercent ?? 0) * (unitPrice * qty), 0) / totalAll)
          : 0;
      }
    }
    for (const { unitPrice, qty } of items) {
      subtotal += unitPrice * qty;
    }
    const fees = calculateMarketplaceFees(subtotal, affiliateCommissionPercent, globalDiscountPercent);

    sellerOrdersData.push({
      sellerId,
      subtotal,
      platformFixedFee: fees.platformFixedFee,
      affiliateCommission: fees.affiliateCommission,
      affiliateId: fees.affiliateCommission > 0 ? affiliateId : null,
      couponDiscount: fees.couponDiscount,
      sellerReceives: fees.sellerReceives,
      items: items.map(({ item, unitPrice, qty }) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: qty,
        unitPrice,
      })),
    });

    totalAmount += fees.finalPrice;
  }

  totalAmount = Math.round(totalAmount * 100) / 100;

  if (totalAmount <= 0) {
    throw new Error('Total deve ser maior que zero');
  }

  const result = await prisma.$transaction(async (tx) => {
    const marketOrder = await tx.marketOrder.create({
      data: {
        buyerId,
        totalAmount,
        paymentStatus: 'pending',
        orderStatus: 'CREATED',
        globalCouponId: globalCouponId || undefined,
      },
    });

    for (const so of sellerOrdersData) {
      const sellerOrder = await tx.sellerOrder.create({
        data: {
          marketOrderId: marketOrder.id,
          sellerId: so.sellerId,
          subtotal: so.subtotal,
          platformFixedFee: so.platformFixedFee,
          affiliateCommission: so.affiliateCommission,
          affiliateId: so.affiliateId || undefined,
          couponDiscount: so.couponDiscount,
          sellerReceives: so.sellerReceives,
          status: 'PENDING',
        },
      });

      for (const oi of so.items) {
        await tx.orderItem.create({
          data: {
            sellerOrderId: sellerOrder.id,
            productId: oi.productId,
            variantId: oi.variantId,
            quantity: oi.quantity,
            unitPrice: oi.unitPrice,
          },
        });
      }

      // Reservar estoque
      for (const oi of so.items) {
        if (oi.variantId) {
          await tx.productVariant.update({
            where: { id: oi.variantId },
            data: { stockReserved: { increment: oi.quantity } },
          });
        } else {
          await tx.product.update({
            where: { id: oi.productId },
            data: { stockReserved: { increment: oi.quantity } },
          });
        }
      }
    }

    // Limpar carrinho
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return marketOrder;
  });

  // Gerar QR Pix via SwapVerse
  const config = await prisma.config.findUnique({ where: { id: 'config' } });
  const platformWallet = config?.walletAddress || process.env.LIQUID_WALLET_ADDRESS || '';

  const qrResult = await generateDepixQr({
    amount: totalAmount.toFixed(2),
    depix_wallet_address: platformWallet,
    fee: '0.2',
  });

  if (!qrResult.success || !('order' in qrResult)) {
    return {
      orderId: result.id,
      totalAmount,
      qrCode: undefined,
      qrCodeImage: undefined,
      swapverseOrderId: undefined,
    };
  }

  return {
    orderId: result.id,
    totalAmount,
    qrCode: qrResult.order.qr_copy_paste,
    qrCodeImage: qrResult.order.qr_image_url,
    swapverseOrderId: qrResult.order.id,
  };
}
