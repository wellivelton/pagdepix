/**
 * API Gateway - Cobranças Pix para comerciantes com liquidação D+1.
 * Integração em sites/apps como gateway de pagamento.
 */

import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { prisma } from '../prisma';
import { generateDepixQr } from '../services/swapverse';
import {
  checkMerchantLimits,
  getMerchantFees,
  validatePayerTaxNumber,
  SWAPVERSE_PAYER_DOC_THRESHOLD,
} from './commerceController';

const FRONTEND_BASE = (process.env.FRONTEND_URL || 'https://pagdepix.com').replace(/\/$/, '');

const GATEWAY_DELAY_HOURS = 24; // Liquidação D+1

function slugAleatorio(len = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += chars[buf[i]! % chars.length];
  return s;
}

function uniqueSlug(prefix = 'gw_'): string {
  return prefix + slugAleatorio(12);
}

/**
 * POST /api/gateway/charges - Criar cobrança Pix com QR (liquidação D+1)
 */
export async function createCharge(req: Request, res: Response) {
  try {
    const payload = (req as any).commerceApiKey;
    if (!payload) return res.status(401).json({ error: 'Não autenticado' });

    const {
      amount,
      description,
      metadata,
      expires_in_minutes,
      payer_name,
      payer_tax_number,
    } = req.body || {};

    const amountNum = typeof amount === 'number' ? amount : parseFloat(String(amount || '0').replace(',', '.'));
    if (!Number.isFinite(amountNum) || amountNum < 5) {
      return res.status(400).json({ error: 'amount inválido. Mínimo R$ 5,00.' });
    }

    const partner = await prisma.commercePartner.findUnique({
      where: { id: payload.partnerId },
      select: { userId: true, transactionLimit: true },
    });
    if (!partner) return res.status(403).json({ error: 'Parceiro não encontrado' });

    if (amountNum > (partner.transactionLimit || 500)) {
      return res.status(400).json({ error: `Valor excede o limite de R$ ${partner.transactionLimit}.` });
    }

    const settings = await (prisma as any).commerceSettings?.findUnique?.({
      where: { partnerId: payload.partnerId },
      select: { liquidWallet: true },
    });
    const liquidWallet = settings?.liquidWallet?.trim();
    if (!liquidWallet || liquidWallet.length < 20) {
      return res.status(400).json({
        error: 'Carteira Liquid não configurada. Configure em Configurações > Carteira.',
      });
    }

    const grossAmount = Math.round(amountNum * 100) / 100;
    const needsPayerDoc = grossAmount >= SWAPVERSE_PAYER_DOC_THRESHOLD;
    const payerName = payer_name != null ? String(payer_name).trim() : '';
    const payerTaxNumberRaw = payer_tax_number != null ? String(payer_tax_number).replace(/\D/g, '') : '';

    if (needsPayerDoc) {
      if (!payerName || payerName.length < 2) {
        return res.status(400).json({
          error: 'Para valores a partir de R$ 500,00 é obrigatório informar payer_name.',
        });
      }
      if (!payerTaxNumberRaw || !validatePayerTaxNumber(payerTaxNumberRaw)) {
        return res.status(400).json({
          error: 'Para valores a partir de R$ 500,00 é obrigatório informar payer_tax_number (CPF ou CNPJ).',
        });
      }
    }

    const limitsCheck = await checkMerchantLimits(partner.userId, grossAmount, payerTaxNumberRaw || undefined);
    if (!limitsCheck.allowed) {
      return res.status(400).json({ error: limitsCheck.error });
    }

    const fees = await getMerchantFees(partner.userId);
    const fixedFeePaid = fees.fixedFee;
    const variableFeePaid = Math.round(grossAmount * (fees.variablePercent / 100) * 100) / 100;
    const totalToPay = grossAmount;

    let slug = uniqueSlug();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await prisma.commerceLink.findUnique({ where: { slug } });
      if (!existing) break;
      slug = uniqueSlug() + Date.now().toString(36);
      attempts++;
    }

    const expiresAt =
      typeof expires_in_minutes === 'number' && expires_in_minutes > 0
        ? new Date(Date.now() + expires_in_minutes * 60 * 1000)
        : null;

    const link = await prisma.commerceLink.create({
      data: {
        userId: partner.userId,
        titulo: (description && String(description).trim()) || `Cobrança Gateway R$ ${grossAmount.toFixed(2)}`,
        amount: grossAmount,
        slug,
        isActive: true,
      },
    });

    const charge = await prisma.commerceCharge.create({
      data: {
        partnerId: payload.partnerId,
        commerceLinkId: link.id,
        amount: grossAmount,
        description: description ? String(description).trim() : null,
        metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
        status: 'pending',
        expiresAt,
      },
    });

    const qrResult = await generateDepixQr({
      amount: totalToPay.toFixed(2),
      depix_wallet_address: liquidWallet,
      fee: '0.2',
      delay_hours: GATEWAY_DELAY_HOURS,
      payer_name: payerName || undefined,
      payer_tax_number: payerTaxNumberRaw || undefined,
    });

    if (!qrResult.success) {
      const errorMsg = 'error' in qrResult ? qrResult.error : 'Não foi possível gerar o QR Code Pix.';
      return res.status(400).json({ error: errorMsg });
    }

    if (!('order' in qrResult)) {
      return res.status(400).json({ error: 'Não foi possível gerar o QR Code Pix.' });
    }

    const order = qrResult.order;
    await (prisma as any).depixOrder?.create?.({
      data: {
        userId: partner.userId,
        orderId: order.id,
        amount: grossAmount,
        totalToPay,
        status: order.status || 'pending',
        commerceLinkId: link.id,
        payerName: payerName || null,
        payerTaxNumber: payerTaxNumberRaw || null,
        grossAmount,
        fixedFeePaid,
        variableFeePaid,
        pagdepixProfit: Math.round(grossAmount * 0.003 * 100) / 100,
        swapverseFee: Math.round(grossAmount * 0.002 * 100) / 100,
      },
    });

    const paymentUrl = `${FRONTEND_BASE}/pay/${link.slug}`;

    return res.status(201).json({
      id: charge.id,
      status: 'pending',
      amount: charge.amount,
      payment_url: paymentUrl,
      qr_image_url: order.qr_image_url,
      qr_copy_paste: order.qr_copy_paste,
      order_id: order.id,
      expires_at: expiresAt?.toISOString() ?? null,
      created_at: charge.createdAt.toISOString(),
      settlement: 'D+1',
    });
  } catch (e: any) {
    console.error('[gateway createCharge]', e?.message);
    return res.status(500).json({ error: e?.message || 'Erro ao criar cobrança' });
  }
}

/**
 * GET /api/gateway/charges/:id - Consultar status da cobrança
 */
export async function getChargeStatus(req: Request, res: Response) {
  try {
    const payload = (req as any).commerceApiKey;
    if (!payload) return res.status(401).json({ error: 'Não autenticado' });

    const chargeId =
      typeof req.params.id === 'string' ? req.params.id : Array.isArray(req.params.id) ? req.params.id[0] : '';
    if (!chargeId) return res.status(400).json({ error: 'id obrigatório' });

    const charge = await prisma.commerceCharge.findFirst({
      where: {
        id: chargeId,
        partnerId: payload.partnerId,
        commerceLink: { slug: { startsWith: 'gw_' } },
      },
      include: { commerceLink: true },
    });

    if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada' });

    let status = charge.status;
    let paidAt: string | null = charge.paidAt?.toISOString() ?? null;

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

    if (status === 'pending' && charge.expiresAt && new Date() > charge.expiresAt) {
      status = 'expired';
    }

    return res.json({
      id: charge.id,
      status,
      amount: charge.amount,
      paid_at: paidAt,
      metadata: (charge.metadata as Record<string, unknown>) || {},
      settlement: 'D+1',
    });
  } catch (e: any) {
    console.error('[gateway getChargeStatus]', e?.message);
    return res.status(500).json({ error: e?.message || 'Erro ao consultar cobrança' });
  }
}

/**
 * GET /api/gateway/charges/:id/qr - Obter novo QR (se o anterior expirou)
 */
export async function refreshChargeQr(req: Request, res: Response) {
  try {
    const payload = (req as any).commerceApiKey;
    if (!payload) return res.status(401).json({ error: 'Não autenticado' });

    const chargeId =
      typeof req.params.id === 'string' ? req.params.id : Array.isArray(req.params.id) ? req.params.id[0] : '';
    if (!chargeId) return res.status(400).json({ error: 'id obrigatório' });

    const charge = await prisma.commerceCharge.findFirst({
      where: {
        id: chargeId,
        partnerId: payload.partnerId,
        commerceLink: { slug: { startsWith: 'gw_' } },
      },
      include: { commerceLink: true },
    });

    if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada' });
    if (charge.status !== 'pending') {
      return res.status(400).json({ error: 'Cobrança já foi paga ou expirou.' });
    }

    const settings = await (prisma as any).commerceSettings?.findUnique?.({
      where: { partnerId: payload.partnerId },
      select: { liquidWallet: true },
    });
    const liquidWallet = settings?.liquidWallet?.trim();
    if (!liquidWallet || liquidWallet.length < 20) {
      return res.status(400).json({ error: 'Carteira Liquid não configurada.' });
    }

    const grossAmount = charge.amount;
    const fees = await getMerchantFees(payload.userId);
    const variableFeePaid = Math.round(grossAmount * (fees.variablePercent / 100) * 100) / 100;
    const totalToPay = grossAmount;

    const qrResult = await generateDepixQr({
      amount: totalToPay.toFixed(2),
      depix_wallet_address: liquidWallet,
      fee: '0.2',
      delay_hours: GATEWAY_DELAY_HOURS,
    });

    if (!qrResult.success) {
      const errorMsg = 'error' in qrResult ? qrResult.error : 'Não foi possível gerar o QR Code.';
      return res.status(400).json({ error: errorMsg });
    }

    if (!('order' in qrResult)) {
      return res.status(400).json({ error: 'Não foi possível gerar o QR Code.' });
    }

    const order = qrResult.order;
    await (prisma as any).depixOrder?.create?.({
      data: {
        userId: payload.userId,
        orderId: order.id,
        amount: grossAmount,
        totalToPay,
        status: order.status || 'pending',
        commerceLinkId: charge.commerceLinkId,
        grossAmount,
        fixedFeePaid: fees.fixedFee,
        variableFeePaid,
        pagdepixProfit: Math.round(grossAmount * 0.003 * 100) / 100,
        swapverseFee: Math.round(grossAmount * 0.002 * 100) / 100,
      },
    });

    return res.json({
      order_id: order.id,
      qr_image_url: order.qr_image_url,
      qr_copy_paste: order.qr_copy_paste,
    });
  } catch (e: any) {
    console.error('[gateway refreshChargeQr]', e?.message);
    return res.status(500).json({ error: e?.message || 'Erro ao gerar QR' });
  }
}

/**
 * GET /api/gateway/transactions - Listar transações (apenas gateway)
 */
export async function listTransactions(req: Request, res: Response) {
  try {
    const payload = (req as any).commerceApiKey;
    if (!payload) return res.status(401).json({ error: 'Não autenticado' });

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status as string | undefined;

    const chargeIds = await prisma.commerceCharge.findMany({
      where: {
        partnerId: payload.partnerId,
        commerceLink: { slug: { startsWith: 'gw_' } },
      },
      select: { commerceLinkId: true },
    }).then((r) => r.map((c) => c.commerceLinkId));

    if (chargeIds.length === 0) {
      return res.json({
        transactions: [],
        pagination: { page, limit, total: 0 },
      });
    }

    const where: Record<string, unknown> = { commerceLinkId: { in: chargeIds } };
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
        },
      }),
      prisma.depixOrder.count({ where }),
    ]);

    const chargeIdsByLink = await prisma.commerceCharge.findMany({
      where: { commerceLinkId: { in: chargeIds } },
      select: { id: true, commerceLinkId: true },
    }).then((list) => Object.fromEntries(list.map((c) => [c.commerceLinkId, c.id])));

    const transactions = orders.map((o) => ({
      id: o.id,
      charge_id: o.commerceLinkId ? chargeIdsByLink[o.commerceLinkId] ?? null : null,
      amount: o.totalToPay ?? o.amount,
      status: o.status === 'depix_sent' ? 'paid' : 'pending',
      created_at: o.createdAt.toISOString(),
      paid_at: o.status === 'depix_sent' ? o.createdAt.toISOString() : null,
      link_title: (o as any).commerceLink?.titulo ?? null,
    }));

    return res.json({
      transactions,
      pagination: { page, limit, total },
    });
  } catch (e: any) {
    console.error('[gateway listTransactions]', e?.message);
    return res.status(500).json({ error: e?.message || 'Erro ao listar transações' });
  }
}
