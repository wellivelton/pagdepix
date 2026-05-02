import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import { calculateMarketplaceFees } from '../../utils/marketplaceFees';
import { generateDepixQr, getDepixOrderStatus } from '../../services/swapverse';
import { deliverOrder } from '../../services/marketplace/delivery.service';
import { validateDownloadToken } from '../../services/marketplace/downloadLink.service';
import { sendMarketplaceOrderPendingEmail } from '../../services/email.service';
import { env } from '../../config/env';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Iniciar checkout: cria MarketplaceOrder e retorna QR Code Pix (SwapVerse).
 */
export const createOrder = async (req: Request, res: Response) => {
  const buyerId = (req as any).userId;
  const { productId, couponCode } = req.body as { productId?: string; couponCode?: string };

  try {
    if (!productId) return res.status(400).json({ error: 'productId é obrigatório' });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { seller: { select: { id: true } } },
    });
    if (!product || product.status !== 'APPROVED') {
      return res.status(404).json({ error: 'Produto não encontrado ou não aprovado' });
    }

    const price = product.priceInDepix;
    let couponDiscountPercent = 0;
    let sellerCouponId: string | null = null;
    let affiliateId: string | null = null;

    if (couponCode && typeof couponCode === 'string') {
      const coupon = await prisma.sellerCoupon.findFirst({
        where: {
          code: couponCode.trim().toUpperCase(),
          isActive: true,
          sellerId: product.sellerId,
          OR: [{ productId: null }, { productId: product.id }],
        },
      });
      if (coupon) {
        if (coupon.maxUsage != null && coupon.usageCount >= coupon.maxUsage) {
          return res.status(400).json({ error: 'Cupom esgotado' });
        }
        if (coupon.expiresAt && coupon.expiresAt < new Date()) {
          return res.status(400).json({ error: 'Cupom expirado' });
        }
        couponDiscountPercent = coupon.discountPercent;
        sellerCouponId = coupon.id;
      }
    }

    const affiliateCommissionPercent = product.allowAffiliates ? product.affiliateCommissionPercent : 0;
    const fees = calculateMarketplaceFees(price, affiliateCommissionPercent, couponDiscountPercent);
    const finalPriceBrl = fees.finalPrice;

    // Produto tipo CODE: verificar se há códigos disponíveis
    if (product.deliveryType === 'CODE') {
      const codesAvailable = await prisma.productCode.count({
        where: { productId: product.id, isUsed: false },
      });
      if (codesAvailable === 0) {
        return res.status(400).json({ error: 'Produto temporariamente indisponível. O vendedor precisa adicionar mais códigos.' });
      }
    }

    // Produto gratuito: entrega imediata sem SwapVerse
    if (finalPriceBrl <= 0) {
      const order = await prisma.marketplaceOrder.create({
        data: {
          buyerId,
          productId: product.id,
          sellerId: product.sellerId,
          productPrice: fees.productPrice,
          platformFee: fees.platformVariableFee,
          platformFixedFee: fees.platformFixedFee,
          affiliateCommission: fees.affiliateCommission,
          couponDiscount: fees.couponDiscount,
          finalPrice: fees.finalPrice,
          sellerReceives: fees.sellerReceives,
          paymentStatus: 'paid',
          paidAt: new Date(),
          settlementStatus: 'available',
        },
      });

      if (sellerCouponId) {
        await prisma.sellerCoupon.update({
          where: { id: sellerCouponId },
          data: { usageCount: { increment: 1 } },
        });
      }

      await prisma.product.update({
        where: { id: product.id },
        data: {
          purchaseCount: { increment: 1 },
          totalRevenue: { increment: order.sellerReceives },
        },
      });

      const deliveryResult = await deliverOrder(order.id);

      const orderWithDetails = await prisma.marketplaceOrder.findUnique({
        where: { id: order.id },
        include: { product: { select: { title: true, slug: true, deliveryType: true } } },
      });

      return res.status(201).json({
        success: true,
        orderId: order.id,
        freeProduct: true,
        totalToPay: 0,
        order: orderWithDetails,
        delivered: deliveryResult.success,
      });
    }

    const config = await prisma.config.findUnique({ where: { id: 'config' } });
    const platformWallet = config?.walletAddress || env.LIQUID_WALLET_ADDRESS;
    if (!platformWallet) {
      return res.status(500).json({ error: 'Carteira da plataforma não configurada' });
    }

    const qrResult = await generateDepixQr({
      amount: finalPriceBrl.toFixed(2),
      depix_wallet_address: platformWallet,
      fee: '0.2',
    });

    if (!qrResult.success || !('order' in qrResult)) {
      return res.status(400).json({ error: 'error' in qrResult ? qrResult.error : 'Erro ao gerar QR Pix' });
    }

    const order = await prisma.marketplaceOrder.create({
      data: {
        buyerId,
        productId: product.id,
        sellerId: product.sellerId,
        productPrice: fees.productPrice,
        platformFee: fees.platformVariableFee,
        platformFixedFee: fees.platformFixedFee,
        affiliateCommission: fees.affiliateCommission,
        couponDiscount: fees.couponDiscount,
        finalPrice: fees.finalPrice,
        sellerReceives: fees.sellerReceives,
        swapverseOrderId: qrResult.order.id,
        paymentStatus: 'pending',
        couponId: sellerCouponId,
        affiliateId,
      },
    });

    if (sellerCouponId) {
      await prisma.sellerCoupon.update({
        where: { id: sellerCouponId },
        data: { usageCount: { increment: 1 } },
      });
    }

    // E-mail ao comprador: pedido aguardando confirmação
    prisma.user.findUnique({ where: { id: buyerId }, select: { email: true, name: true } }).then((buyer) => {
      if (buyer?.email) {
        sendMarketplaceOrderPendingEmail(buyer.email, buyer.name || 'Cliente', {
          productTitle: product.title,
          orderId: order.id,
          amount: finalPriceBrl,
          expiresAt: qrResult.order.expires_at,
        }).catch((e) => console.error('[createOrder] Erro ao enviar email:', e?.message));
      }
    });

    res.status(201).json({
      success: true,
      orderId: order.id,
      swapverseOrderId: qrResult.order.id,
      qr_image_url: qrResult.order.qr_image_url,
      qr_copy_paste: qrResult.order.qr_copy_paste,
      totalToPay: finalPriceBrl,
      expires_at: qrResult.order.expires_at,
    });
  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  }
};

/**
 * Admin: listar todas as vendas do marketplace.
 */
export const adminListOrders = async (req: Request, res: Response) => {
  try {
    if ((req as any).userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const { status, page = '1', limit = '20' } = req.query;
    const where: any = {};
    if (status && typeof status === 'string' && status !== 'ALL') {
      where.paymentStatus = status;
    }
    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      prisma.marketplaceOrder.findMany({
        where,
        include: {
          product: { select: { id: true, title: true, slug: true, deliveryType: true } },
          buyer: { select: { id: true, name: true, email: true } },
          seller: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.marketplaceOrder.count({ where }),
    ]);

    const [paidCount, revenueResult, platformFeesResult, topSellers, topProducts] = await Promise.all([
      prisma.marketplaceOrder.count({ where: { paymentStatus: 'paid' } }),
      prisma.marketplaceOrder.aggregate({
        where: { paymentStatus: 'paid' },
        _sum: { finalPrice: true, platformFee: true, platformFixedFee: true },
      }),
      prisma.marketplaceOrder.aggregate({
        where: { paymentStatus: 'paid' },
        _sum: {
          platformFee: true,
          platformFixedFee: true,
        },
      }),
      prisma.marketplaceOrder.groupBy({
        by: ['sellerId'],
        where: { paymentStatus: 'paid' },
        _sum: { finalPrice: true },
        _count: { id: true },
      }),
      prisma.marketplaceOrder.groupBy({
        by: ['productId'],
        where: { paymentStatus: 'paid' },
        _sum: { finalPrice: true },
        _count: { id: true },
      }),
    ]);

    const topSellersSorted = [...topSellers].sort((a, b) => (Number(b._sum?.finalPrice) || 0) - (Number(a._sum?.finalPrice) || 0)).slice(0, 10);
    const topProductsSorted = [...topProducts].sort((a, b) => (b._count?.id || 0) - (a._count?.id || 0)).slice(0, 10);
    const sellerIds = topSellersSorted.map((s: { sellerId: string }) => s.sellerId);
    const productIds = topProductsSorted.map((p: { productId: string }) => p.productId);
    const [sellers, products] = await Promise.all([
      sellerIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: sellerIds } },
            select: { id: true, name: true, email: true },
          })
        : [],
      productIds.length > 0
        ? prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, title: true, slug: true },
          })
        : [],
    ]);
    const sellerMap = Object.fromEntries(sellers.map((s) => [s.id, s]));
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

    const platformFeeTotal =
      (Number(platformFeesResult._sum?.platformFee) || 0) + (Number(platformFeesResult._sum?.platformFixedFee) || 0);

    res.json({
      orders,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      stats: {
        totalOrders: total,
        paidOrders: paidCount,
        totalRevenue: Number(revenueResult._sum?.finalPrice) || 0,
        platformFees: platformFeeTotal,
        topSellers: topSellersSorted.map((s) => ({
          seller: sellerMap[s.sellerId],
          revenue: Number(s._sum?.finalPrice) || 0,
          ordersCount: s._count?.id || 0,
        })),
        topProducts: topProductsSorted.map((p) => ({
          product: productMap[p.productId],
          revenue: Number(p._sum?.finalPrice) || 0,
          salesCount: p._count?.id || 0,
        })),
      },
    });
  } catch (error) {
    console.error('Erro ao listar vendas (admin):', error);
    res.status(500).json({ error: 'Erro ao listar vendas' });
  }
};

/**
 * Status do pedido (polling pelo frontend). Suporta MarketplaceOrder e MarketOrder.
 */
export const getOrderStatus = async (req: Request, res: Response) => {
  const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
  const userId = (req as any).userId;

  try {
    if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });
    const legacy = await prisma.marketplaceOrder.findFirst({
      where: { id: orderId as string, buyerId: userId },
      include: { product: { select: { title: true, slug: true, deliveryType: true } } },
    });
    if (legacy) {
      const order = legacy;
      if (order.paymentStatus === 'pending' && order.swapverseOrderId) {
        const statusResult = await getDepixOrderStatus(order.swapverseOrderId);
        if (statusResult.success && statusResult.order?.status === 'depix_sent') {
          await prisma.marketplaceOrder.update({
            where: { id: orderId },
            data: { paymentStatus: 'paid', paidAt: new Date() },
          });
          await prisma.product.update({
            where: { id: order.productId },
            data: {
              purchaseCount: { increment: 1 },
              totalRevenue: { increment: order.sellerReceives },
            },
          });
          const deliveryResult = await deliverOrder(orderId);
          const d = new Date();
          d.setDate(d.getDate() + 1);
          await prisma.marketplaceOrder.update({
            where: { id: orderId },
            data: { settlementStatus: 'locked', settlementAvailableAt: d },
          });
          if (deliveryResult.success) {
            const updated = await prisma.marketplaceOrder.findUnique({
              where: { id: orderId },
              include: { product: { select: { title: true, slug: true, deliveryType: true } } },
            });
            return res.json(updated);
          }
        }
      }
      return res.json(order);
    }

    const market = await prisma.marketOrder.findFirst({
      where: { id: orderId as string, buyerId: userId },
    });
    if (market) {
      return res.json({
        id: market.id,
        paymentStatus: market.paymentStatus,
        orderStatus: market.orderStatus,
        totalAmount: market.totalAmount,
      });
    }

    return res.status(404).json({ error: 'Pedido não encontrado' });
  } catch (error) {
    console.error('Erro ao buscar status:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Minhas compras (buyer) - MarketplaceOrder legado + MarketOrder novo.
 */
export const getMyOrders = async (req: Request, res: Response) => {
  const buyerId = (req as any).userId;

  try {
    const [legacy, marketOrders] = await Promise.all([
      prisma.marketplaceOrder.findMany({
        where: { buyerId },
        include: {
          product: { select: { title: true, slug: true, coverImageUrl: true, deliveryType: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.marketOrder.findMany({
        where: { buyerId },
        include: {
          sellerOrders: {
            include: {
              items: { include: { product: { select: { title: true, slug: true, coverImageUrl: true } } } },
              seller: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const legacyFormatted = legacy.map((o: any) => ({ ...o, _source: 'legacy' }));
    const marketFormatted = marketOrders.map((o: any) => ({ ...o, _source: 'market_order' }));
    const merged = [...legacyFormatted, ...marketFormatted].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.json(merged);
  } catch (error) {
    console.error('Erro ao listar pedidos:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Detalhe do pedido (buyer ou seller). Suporta MarketplaceOrder e MarketOrder.
 */
export const getOrderDetail = async (req: Request, res: Response) => {
  const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
  const userId = (req as any).userId;
  const role = (req as any).userRole;

  try {
    if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });

    const legacy = await prisma.marketplaceOrder.findFirst({
      where: {
        id: orderId,
        OR: [{ buyerId: userId }, { sellerId: userId }, role === 'ADMIN' ? {} : { id: 'never' }],
      },
      include: {
        product: true,
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
      },
    });
    if (legacy) return res.json({ ...legacy, _source: 'legacy' });

    const marketWhere: Record<string, unknown> = { id: orderId };
    if (role !== 'ADMIN') {
      marketWhere.OR = [{ buyerId: userId }, { sellerOrders: { some: { sellerId: userId } } }];
    }
    const market = await prisma.marketOrder.findFirst({
      where: marketWhere,
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        sellerOrders: {
          include: {
            seller: { select: { id: true, name: true, email: true } },
            items: { include: { product: true, variant: true, review: true } },
          },
        },
      },
    });
    if (market) return res.json({ ...market, _source: 'market_order' });

    return res.status(404).json({ error: 'Pedido não encontrado' });
  } catch (error) {
    console.error('Erro ao buscar pedido:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Download de arquivo com token assinado.
 * Suporta MarketplaceOrder (legado) e OrderItem (novo modelo).
 */
export const downloadFile = async (req: Request, res: Response) => {
  const token = req.query.token as string;

  try {
    const decoded = validateDownloadToken(token);
    if (!decoded) return res.status(403).json({ error: 'Link inválido ou expirado' });

    const entityId = decoded.orderId;

    // 1) Tentar MarketplaceOrder (legado)
    const legacyOrder = await prisma.marketplaceOrder.findUnique({
      where: { id: entityId },
      include: { product: { include: { files: true } } },
    });
    if (legacyOrder && legacyOrder.paymentStatus === 'paid') {
      const file = legacyOrder.product.files.find((f) => f.id === decoded.fileId);
      if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });
      if (legacyOrder.downloadLimit != null && legacyOrder.downloadCount >= legacyOrder.downloadLimit) {
        return res.status(403).json({ error: 'Limite de downloads atingido' });
      }
      const fullPath = path.isAbsolute(file.filePath) ? file.filePath : path.resolve(__dirname, '..', '..', file.filePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
      await prisma.marketplaceOrder.update({ where: { id: entityId }, data: { downloadCount: { increment: 1 } } });
      return res.download(fullPath, file.originalFilename || file.filename);
    }

    // 2) Tentar OrderItem (novo modelo)
    const orderItem = await prisma.orderItem.findUnique({
      where: { id: entityId },
      include: {
        product: { include: { files: true } },
        sellerOrder: { include: { marketOrder: true } },
      },
    });
    if (!orderItem || orderItem.sellerOrder.marketOrder.paymentStatus !== 'paid') {
      return res.status(403).json({ error: 'Pedido não autorizado' });
    }
    const file = orderItem.product.files.find((f) => f.id === decoded.fileId);
    if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });
    if (orderItem.downloadLimit != null && orderItem.downloadCount >= orderItem.downloadLimit) {
      return res.status(403).json({ error: 'Limite de downloads atingido' });
    }
    const fullPath = path.isAbsolute(file.filePath) ? file.filePath : path.resolve(__dirname, '..', '..', file.filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
    await prisma.orderItem.update({ where: { id: entityId }, data: { downloadCount: { increment: 1 } } });
    return res.download(fullPath, file.originalFilename || file.filename);
  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({ error: 'Erro ao baixar' });
  }
};
