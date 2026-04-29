import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { prisma } from '../prisma';
import { dispatchCommerceWebhook } from '../services/commerceWebhookService';

const FRONTEND_BASE = (process.env.FRONTEND_URL || 'https://pagdepix.com').replace(/\/$/, '');

function slugAleatorio(len = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += chars[buf[i]! % chars.length];
  return s;
}

function uniqueSlug(prefix = 'ch_'): string {
  return prefix + slugAleatorio(12);
}

/**
 * POST /commerce/api/charges - Criar cobrança
 */
export async function createCharge(req: Request, res: Response) {
  try {
    const payload = (req as any).commerceApiKey;
    if (!payload) return res.status(401).json({ error: 'Não autenticado' });

    const { amount, description, metadata, expires_in_minutes } = req.body || {};

    const amountNum = typeof amount === 'number' ? amount : parseFloat(String(amount || '0').replace(',', '.'));
    if (!Number.isFinite(amountNum) || amountNum < 0.01) {
      return res.status(400).json({ error: 'amount inválido. Mínimo 0.01' });
    }

    const partner = await prisma.commercePartner.findUnique({
      where: { id: payload.partnerId },
      select: { userId: true, transactionLimit: true },
    });
    if (!partner) return res.status(403).json({ error: 'Parceiro não encontrado' });

    if (amountNum > (partner.transactionLimit || 500)) {
      return res.status(400).json({ error: `Valor excede o limite de R$ ${partner.transactionLimit}.` });
    }

    let slug = uniqueSlug();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await prisma.commerceLink.findUnique({ where: { slug } });
      if (!existing) break;
      slug = uniqueSlug() + Date.now().toString(36);
      attempts++;
    }

    const expiresAt = typeof expires_in_minutes === 'number' && expires_in_minutes > 0
      ? new Date(Date.now() + expires_in_minutes * 60 * 1000)
      : null;

    const link = await prisma.commerceLink.create({
      data: {
        userId: partner.userId,
        titulo: (description && String(description).trim()) || `Cobrança API R$ ${amountNum.toFixed(2)}`,
        amount: Math.round(amountNum * 100) / 100,
        slug,
        isActive: true,
      },
    });

    const charge = await prisma.commerceCharge.create({
      data: {
        partnerId: payload.partnerId,
        commerceLinkId: link.id,
        amount: Math.round(amountNum * 100) / 100,
        description: description ? String(description).trim() : null,
        metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
        status: 'pending',
        expiresAt,
      },
    });

    const paymentUrl = `${FRONTEND_BASE}/pay/${link.slug}`;

    return res.status(201).json({
      id: charge.id,
      status: 'pending',
      amount: charge.amount,
      payment_url: paymentUrl,
      slug: link.slug,
      expires_at: expiresAt?.toISOString() ?? null,
      created_at: charge.createdAt.toISOString(),
    });
  } catch (e: any) {
    console.error('[commerceApi createCharge]', e?.message);
    return res.status(500).json({ error: e?.message || 'Erro ao criar cobrança' });
  }
}

/**
 * GET /commerce/api/charges/:chargeId - Consultar status da cobrança
 */
export async function getChargeStatus(req: Request, res: Response) {
  try {
    const payload = (req as any).commerceApiKey;
    if (!payload) return res.status(401).json({ error: 'Não autenticado' });

    const chargeId = typeof req.params.chargeId === 'string' ? req.params.chargeId : Array.isArray(req.params.chargeId) ? req.params.chargeId[0] : '';
    if (!chargeId) return res.status(400).json({ error: 'chargeId obrigatório' });

    const charge = await prisma.commerceCharge.findFirst({
      where: { id: chargeId, partnerId: payload.partnerId },
      include: { commerceLink: true },
    });

    if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada' });

    let status = charge.status;
    let paidAt: string | null = charge.paidAt?.toISOString() ?? null;
    let txHash: string | null = null;

    // Se pendente, verificar se há DepixOrder pago para o link (caso sync ainda não rodou)
    if (charge.status === 'pending') {
      const paidOrder = await prisma.depixOrder.findFirst({
        where: { commerceLinkId: charge.commerceLinkId, status: 'depix_sent' },
        orderBy: { createdAt: 'desc' },
      });
      if (paidOrder) {
        status = 'paid';
        paidAt = paidOrder.createdAt.toISOString();
        await prisma.commerceCharge.update({
          where: { id: charge.id },
          data: { status: 'paid', depixOrderId: paidOrder.id, paidAt: paidOrder.createdAt },
        });
      }
    }
    if (status === 'paid' && charge.depixOrderId) {
      const order = await prisma.depixOrder.findUnique({
        where: { id: charge.depixOrderId },
      });
      if (order) paidAt = order.createdAt.toISOString();
    }

    if (status === 'pending' && charge.expiresAt && new Date() > charge.expiresAt) {
      status = 'expired';
    }

    return res.json({
      id: charge.id,
      status,
      amount: charge.amount,
      paid_at: paidAt,
      tx_hash: txHash,
      metadata: (charge.metadata as Record<string, unknown>) || {},
    });
  } catch (e: any) {
    console.error('[commerceApi getChargeStatus]', e?.message);
    return res.status(500).json({ error: e?.message || 'Erro ao consultar cobrança' });
  }
}

/**
 * POST /commerce/api/links - Criar link de pagamento
 */
export async function createLink(req: Request, res: Response) {
  try {
    const payload = (req as any).commerceApiKey;
    if (!payload) return res.status(401).json({ error: 'Não autenticado' });

    const { amount, title, slug: customSlug } = req.body || {};

    const amountNum = typeof amount === 'number' ? amount : parseFloat(String(amount || '0').replace(',', '.'));
    if (!Number.isFinite(amountNum) || amountNum < 0.01) {
      return res.status(400).json({ error: 'amount inválido. Mínimo 0.01' });
    }

    const partner = await prisma.commercePartner.findUnique({
      where: { id: payload.partnerId },
      select: { userId: true },
    });
    if (!partner) return res.status(403).json({ error: 'Parceiro não encontrado' });

    let slug = customSlug && typeof customSlug === 'string'
      ? customSlug.replace(/[^a-z0-9-_]/gi, '').slice(0, 50) || undefined
      : undefined;

    if (!slug) slug = uniqueSlug('lnk_');

    const existing = await prisma.commerceLink.findUnique({ where: { slug } });
    if (existing) {
      slug = slug + Date.now().toString(36);
    }

    const link = await prisma.commerceLink.create({
      data: {
        userId: partner.userId,
        titulo: (title && String(title).trim()) || `Link R$ ${amountNum.toFixed(2)}`,
        amount: Math.round(amountNum * 100) / 100,
        slug,
        isActive: true,
      },
    });

    const url = `${FRONTEND_BASE}/pay/${link.slug}`;

    return res.status(201).json({
      id: link.id,
      url,
      amount: link.amount,
      slug: link.slug,
      created_at: link.createdAt.toISOString(),
    });
  } catch (e: any) {
    console.error('[commerceApi createLink]', e?.message);
    return res.status(500).json({ error: e?.message || 'Erro ao criar link' });
  }
}

/**
 * GET /commerce/api/transactions - Listar transações
 */
export async function listTransactions(req: Request, res: Response) {
  try {
    const payload = (req as any).commerceApiKey;
    if (!payload) return res.status(401).json({ error: 'Não autenticado' });

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status as string | undefined;

    const partner = await prisma.commercePartner.findUnique({
      where: { id: payload.partnerId },
      select: { userId: true },
    });
    if (!partner) return res.status(403).json({ error: 'Parceiro não encontrado' });

    const linkIds = await prisma.commerceLink.findMany({
      where: { userId: partner.userId },
      select: { id: true },
    }).then((r) => r.map((l) => l.id));

    const pageIds = await (prisma as any).commercePage?.findMany?.({
      where: { userId: partner.userId },
      select: { id: true },
    }).then((r: { id: string }[]) => r?.map((p) => p.id) ?? []) ?? [];

    const orConditions: { commerceLinkId?: { in: string[] }; commercePageId?: { in: string[] } }[] = [];
    if (linkIds.length) orConditions.push({ commerceLinkId: { in: linkIds } });
    if (pageIds.length) orConditions.push({ commercePageId: { in: pageIds } });
    if (orConditions.length === 0) {
      return res.json({
        transactions: [],
        pagination: { page, limit, total: 0 },
      });
    }

    const where: Record<string, unknown> = { OR: orConditions };
    if (statusFilter === 'paid') where.status = 'depix_sent';
    else if (statusFilter === 'pending') where.status = { not: 'depix_sent' };

    const [orders, total] = await Promise.all([
      prisma.depixOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          commerceLink: { select: { id: true, titulo: true, slug: true } },
          commercePage: { select: { id: true, titulo: true, slug: true } },
        },
      }),
      prisma.depixOrder.count({ where }),
    ]);

    const transactions = orders.map((o) => ({
      id: o.id,
      amount: o.totalToPay ?? o.amount,
      status: o.status === 'depix_sent' ? 'paid' : 'pending',
      created_at: o.createdAt.toISOString(),
      paid_at: o.status === 'depix_sent' ? o.createdAt.toISOString() : null,
      link_title: (o as any).commerceLink?.titulo ?? (o as any).commercePage?.titulo ?? null,
      link_slug: (o as any).commerceLink?.slug ?? (o as any).commercePage?.slug ?? null,
    }));

    return res.json({
      transactions,
      pagination: { page, limit, total },
    });
  } catch (e: any) {
    console.error('[commerceApi listTransactions]', e?.message);
    return res.status(500).json({ error: e?.message || 'Erro ao listar transações' });
  }
}
