import { Request, Response } from 'express';
import { prisma } from '../../prisma';

/**
 * Admin: listar vendedores (sellers).
 */
export const adminListSellers = async (req: Request, res: Response) => {
  const { page = '1', limit = '20', search } = req.query;

  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { sellerProducts: { some: {} } };
    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    const [sellers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          sellerBalance: true,
          _count: {
            select: { sellerProducts: true, sellerOrdersV2: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      sellers,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('Erro ao listar vendedores:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Dashboard do vendedor: resumo de vendas e saldo.
 */
export const getSellerDashboard = async (req: Request, res: Response) => {
  const sellerId = (req as any).userId;

  try {
    const [balance, legacyPaid, sellerOrderPaid, productsCount, pendingProducts] = await Promise.all([
      prisma.sellerBalance.findUnique({ where: { sellerId } }),
      prisma.marketplaceOrder.count({ where: { sellerId, paymentStatus: 'paid' } }),
      prisma.sellerOrder.count({ where: { sellerId, marketOrder: { paymentStatus: 'paid' } } }),
      prisma.product.count({ where: { sellerId, status: 'APPROVED' } }),
      prisma.product.count({ where: { sellerId, status: 'PENDING_APPROVAL' } }),
    ]);
    const ordersCount = legacyPaid + sellerOrderPaid;

    res.json({
      balance: balance || {
        availableBalance: 0,
        pendingBalance: 0,
        lockedBalance: 0,
        totalEarned: 0,
        liquidWallet: null,
      },
      ordersCount,
      productsCount,
      pendingProducts,
    });
  } catch (error) {
    console.error('Erro no dashboard vendedor:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Vendas do vendedor (legado MarketplaceOrder + novo SellerOrder).
 */
export const getSellerOrders = async (req: Request, res: Response) => {
  const sellerId = (req as any).userId;
  const { status, page = '1', limit = '20', source = 'all', search } = req.query;

  const pageNum = Math.max(1, parseInt(String(page), 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(String(limit), 10)));
  const skip = (pageNum - 1) * limitNum;

  try {
    const legacyWhere: Record<string, unknown> = { sellerId };
    if (status === 'paid' || status === 'PAID') legacyWhere.paymentStatus = 'paid';
    if (status === 'pending' || status === 'PENDING') legacyWhere.paymentStatus = 'pending';
    if (status === 'settlement') legacyWhere.settlementStatus = { in: ['available', 'paid'] };

    const sellerOrderWhere: Record<string, unknown> = { sellerId };
    if (status && typeof status === 'string') {
      const upperStatus = status.toUpperCase();
      if (['PENDING', 'PAID', 'COMPLETED', 'CANCELLED'].includes(upperStatus)) {
        sellerOrderWhere.status = upperStatus;
      } else if (status === 'settlement') {
        sellerOrderWhere.settlementStatus = { in: ['available'] };
      }
    }

    // Filtro de busca por ID parcial
    if (search && typeof search === 'string' && search.trim()) {
      legacyWhere.id = { contains: search.trim(), mode: 'insensitive' as const };
      sellerOrderWhere.id = { contains: search.trim(), mode: 'insensitive' as const };
    }

    const includeLegacy = source === 'all' || source === 'legacy';
    const includeNew = source === 'all' || source === 'seller_order';

    const [legacyOrders, sellerOrders, legacyTotal, sellerOrderTotal] = await Promise.all([
      includeLegacy
        ? prisma.marketplaceOrder.findMany({
            where: legacyWhere,
            include: {
              product: { select: { title: true, slug: true } },
              buyer: { select: { name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip: includeNew ? 0 : skip,
            take: includeNew ? 1000 : limitNum,
          })
        : [],
      includeNew
        ? prisma.sellerOrder.findMany({
            where: sellerOrderWhere,
            include: {
              marketOrder: {
                select: {
                  buyerId: true,
                  paymentStatus: true,
                  buyer: { select: { name: true, email: true } },
                },
              },
              items: {
                include: {
                  product: {
                    select: {
                      title: true,
                      slug: true,
                      deliveryType: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            skip: includeLegacy ? 0 : skip,
            take: includeLegacy ? 1000 : limitNum,
          })
        : [],
      includeLegacy ? prisma.marketplaceOrder.count({ where: legacyWhere }) : 0,
      includeNew ? prisma.sellerOrder.count({ where: sellerOrderWhere }) : 0,
    ]);

    const merged = [
      ...legacyOrders.map((o: any) => ({ ...o, _source: 'legacy' })),
      ...sellerOrders.map((o: any) => ({ ...o, _source: 'seller_order' })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(skip, skip + limitNum);

    const total = legacyTotal + sellerOrderTotal;

    res.json({
      orders: merged,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('Erro ao listar vendas:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Histórico de transações do saldo (vendedor).
 */
export const getSellerTransactions = async (req: Request, res: Response) => {
  const sellerId = (req as any).userId;
  const { page = '1', limit = '30' } = req.query;

  try {
    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      prisma.sellerBalanceTransaction.findMany({
        where: { sellerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.sellerBalanceTransaction.count({ where: { sellerId } }),
    ]);

    res.json({
      transactions,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('Erro ao buscar transações:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Saldo e carteira do vendedor.
 */
export const getSellerBalance = async (req: Request, res: Response) => {
  const sellerId = (req as any).userId;

  try {
    let balance = await prisma.sellerBalance.findUnique({
      where: { sellerId },
    });
    if (!balance) {
      balance = await prisma.sellerBalance.create({
        data: { sellerId },
      });
    }
    res.json(balance);
  } catch (error) {
    console.error('Erro ao buscar saldo:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Atualizar carteira Liquid para saque.
 */
export const updateSellerWallet = async (req: Request, res: Response) => {
  const sellerId = (req as any).userId;
  const { liquidWallet } = req.body as { liquidWallet?: string };

  try {
    if (!liquidWallet || typeof liquidWallet !== 'string' || liquidWallet.trim().length < 20) {
      return res.status(400).json({ error: 'Endereço da carteira Liquid inválido' });
    }

    const balance = await prisma.sellerBalance.upsert({
      where: { sellerId },
      create: { sellerId, liquidWallet: liquidWallet.trim(), lastWalletChange: new Date() },
      update: { liquidWallet: liquidWallet.trim(), lastWalletChange: new Date() },
    });
    res.json(balance);
  } catch (error) {
    console.error('Erro ao atualizar carteira:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Solicitar saque (vendedor).
 */
export const requestSellerWithdrawal = async (req: Request, res: Response) => {
  const sellerId = (req as any).userId;
  const { amount, liquidWallet } = req.body as { amount?: number; liquidWallet?: string };

  try {
    const bal = await prisma.sellerBalance.findUnique({ where: { sellerId } });
    if (!bal) return res.status(400).json({ error: 'Saldo não encontrado' });

    const amt = parseFloat(String(amount));
    if (isNaN(amt) || amt < 1) return res.status(400).json({ error: 'Valor inválido (mínimo 1 DEPIX)' });
    if (amt > bal.availableBalance) return res.status(400).json({ error: 'Saldo insuficiente' });

    const wallet = (liquidWallet || bal.liquidWallet || '').trim();
    if (!wallet || wallet.length < 20) return res.status(400).json({ error: 'Informe a carteira Liquid' });

    const pending = await prisma.sellerWithdrawal.findFirst({
      where: { sellerId, status: 'PENDING' },
    });
    if (pending) return res.status(400).json({ error: 'Você já possui um saque pendente' });

    const withdrawal = await prisma.sellerWithdrawal.create({
      data: { sellerId, amount: amt, liquidWallet: wallet, status: 'PENDING' },
    });
    res.status(201).json({ success: true, withdrawal });
  } catch (error) {
    console.error('Erro ao solicitar saque:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Listar cupons do vendedor.
 */
export const getSellerCoupons = async (req: Request, res: Response) => {
  const sellerId = (req as any).userId;

  try {
    const coupons = await prisma.sellerCoupon.findMany({
      where: { sellerId },
      include: { product: { select: { title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(coupons);
  } catch (error) {
    console.error('Erro ao listar cupons:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: listar saques de vendedores pendentes.
 */
export const adminListSellerWithdrawals = async (req: Request, res: Response) => {
  const { status = 'PENDING', page = '1', limit = '20' } = req.query;

  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (status && String(status) !== 'ALL') {
      where.status = status;
    }

    const [withdrawals, total] = await Promise.all([
      prisma.sellerWithdrawal.findMany({
        where,
        include: { seller: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.sellerWithdrawal.count({ where }),
    ]);

    res.json({
      withdrawals,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('Erro ao listar saques:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: aprovar ou rejeitar saque de vendedor.
 */
export const adminProcessSellerWithdrawal = async (req: Request, res: Response) => {
  const withdrawalId = Array.isArray(req.params.withdrawalId) ? req.params.withdrawalId[0] : req.params.withdrawalId;
  const { action, adminNotes, txid } = req.body as { action?: 'approve' | 'reject'; adminNotes?: string; txid?: string };

  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    if (!withdrawalId || !action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Ação inválida' });
    }

    const withdrawal = await prisma.sellerWithdrawal.findUnique({
      where: { id: withdrawalId },
      include: { seller: { select: { id: true, name: true } } },
    });
    if (!withdrawal) return res.status(404).json({ error: 'Saque não encontrado' });
    if (withdrawal.status !== 'PENDING') {
      return res.status(400).json({ error: 'Saque já processado' });
    }

    if (action === 'approve') {
      const balance = await prisma.sellerBalance.findUnique({ where: { sellerId: withdrawal.sellerId } });
      if (!balance || balance.availableBalance < withdrawal.amount) {
        return res.status(400).json({ error: 'Saldo insuficiente do vendedor' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.sellerWithdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: 'APPROVED',
            adminNotes: adminNotes ?? null,
            txid: txid ?? null,
            processedAt: new Date(),
          },
        });
        const newBalance = await tx.sellerBalance.update({
          where: { sellerId: withdrawal.sellerId },
          data: {
            availableBalance: { decrement: withdrawal.amount },
          },
        });
        await tx.sellerBalanceTransaction.create({
          data: {
            sellerId: withdrawal.sellerId,
            type: 'WITHDRAWAL',
            amount: -withdrawal.amount,
            balanceAfter: newBalance.availableBalance,
            referenceType: 'SellerWithdrawal',
            referenceId: withdrawalId,
            description: `Saque aprovado #${withdrawalId.slice(0, 8)}`,
          },
        });
      });
      const updated = await prisma.sellerWithdrawal.findUnique({
        where: { id: withdrawalId },
        include: { seller: { select: { name: true, email: true } } },
      });
      return res.json({ success: true, message: 'Saque aprovado', withdrawal: updated });
    }

    await prisma.sellerWithdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: 'REJECTED',
        adminNotes: adminNotes ?? null,
        processedAt: new Date(),
      },
    });
    const updated = await prisma.sellerWithdrawal.findUnique({
      where: { id: withdrawalId },
      include: { seller: { select: { name: true, email: true } } },
    });
    return res.json({ success: true, message: 'Saque rejeitado', withdrawal: updated });
  } catch (error) {
    console.error('Erro ao processar saque:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Relatório financeiro do vendedor: vendas por período, produtos e totais.
 * GET /marketplace/seller/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=20
 */
export const getSellerReports = async (req: Request, res: Response) => {
  const sellerId = (req as any).userId;
  const { from, to, page = '1', limit = '20' } = req.query;

  try {
    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const dateFilter: Record<string, unknown> = {};
    if (from && typeof from === 'string') dateFilter.gte = new Date(from);
    if (to && typeof to === 'string') {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.lte = toDate;
    }

    const where: Record<string, unknown> = {
      sellerId,
      status: { in: ['PAID', 'PROCESSING', 'COMPLETED'] },
    };
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter;

    const [orders, total] = await Promise.all([
      prisma.sellerOrder.findMany({
        where,
        include: {
          items: {
            include: { product: { select: { id: true, title: true, slug: true, category: true } } },
          },
          marketOrder: { select: { createdAt: true, paymentStatus: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.sellerOrder.count({ where }),
    ]);

    // Totais agregados para o período
    const aggregated = await prisma.sellerOrder.aggregate({
      where,
      _sum: {
        subtotal: true,
        sellerReceives: true,
        platformFixedFee: true,
        affiliateCommission: true,
        couponDiscount: true,
      },
      _count: { id: true },
    });

    // Top produtos por receita
    const topProducts = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        sellerOrder: where,
      },
      _sum: { unitPrice: true, quantity: true },
      _count: { id: true },
      orderBy: { _sum: { unitPrice: 'desc' } },
      take: 10,
    });

    const productIds = topProducts.map((p) => p.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, title: true, slug: true },
    });
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
    const topProductsWithInfo = topProducts.map((p) => ({
      ...p,
      product: productMap[p.productId] ?? null,
    }));

    const sum = aggregated._sum;
    const count = aggregated._count as { id?: number } | undefined;
    res.json({
      orders,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      summary: {
        totalOrders: count?.id ?? 0,
        totalRevenue: sum?.subtotal ?? 0,
        sellerReceives: sum?.sellerReceives ?? 0,
        platformFee: sum?.platformFixedFee ?? 0,
        affiliateCommissions: sum?.affiliateCommission ?? 0,
        discounts: sum?.couponDiscount ?? 0,
      },
      topProducts: topProductsWithInfo,
    });
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
};

/**
 * Criar cupom do vendedor.
 */
export const createSellerCoupon = async (req: Request, res: Response) => {
  const sellerId = (req as any).userId;
  const { code, discountPercent, productId, maxUsage, expiresAt } = req.body as {
    code?: string;
    discountPercent?: number;
    productId?: string;
    maxUsage?: number;
    expiresAt?: string;
  };

  try {
    const codeStr = String(code || '').trim().toUpperCase();
    if (!codeStr || codeStr.length < 3) return res.status(400).json({ error: 'Código inválido' });

    const discount = parseFloat(String(discountPercent));
    if (isNaN(discount) || discount <= 0 || discount > 100) {
      return res.status(400).json({ error: 'Desconto deve ser entre 0.01 e 100' });
    }

    const existing = await prisma.sellerCoupon.findUnique({ where: { code: codeStr } });
    if (existing) return res.status(400).json({ error: 'Código já existe' });

    if (productId) {
      const product = await prisma.product.findFirst({ where: { id: productId, sellerId } });
      if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const coupon = await prisma.sellerCoupon.create({
      data: {
        sellerId,
        code: codeStr,
        discountPercent: discount,
        productId: productId || null,
        maxUsage: maxUsage != null ? parseInt(String(maxUsage), 10) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    res.status(201).json({ success: true, coupon });
  } catch (error) {
    console.error('Erro ao criar cupom:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

