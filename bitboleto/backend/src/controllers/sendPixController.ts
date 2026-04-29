import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { createWithdrawal, formatDepositAmountExact, getWithdrawalStatus, refreshWithdrawalReceipt } from '../services/geradepixService';
import { fetchAndStoreSendPixReceipt, getStoredReceiptPath } from '../services/sendPixReceiptStorage';

/** Limites GeraDePix: R$ 100 a R$ 6.000 por saque. Taxa ~1%. */

/** GET /depix/send-pix — Lista ordens do usuário (histórico) */
export const listSendPixOrders = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
    const limit = Math.min(50, Math.max(10, parseInt(String(req.query.limit || 20), 10)));
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.sendPixOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          amountBrl: true,
          pixKey: true,
          pixKeyType: true,
          status: true,
          statusDetail: true,
          receiptUrl: true,
          depositAmount: true,
          depositAmountExact: true,
          expiration: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.sendPixOrder.count({ where: { userId } }),
    ]);

    const ordersWithExact = orders.map((o) => ({
      ...o,
      depositAmountExact: o.depositAmountExact
        ?? (o.depositAmount != null ? formatDepositAmountExact(o.depositAmount) : undefined),
    }));

    return res.json({
      orders: ordersWithExact,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[listSendPixOrders] Erro:', error);
    return res.status(500).json({ error: 'Erro ao listar ordens' });
  }
};

/** GET /depix/send-pix/:id/receipt — Download do comprovante PDF (arquivo local ou proxy GeraDePix) */
export const getSendPixReceipt = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const orderId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!orderId) return res.status(400).json({ error: 'ID da ordem é obrigatório' });

    const order = await prisma.sendPixOrder.findFirst({
      where: { id: orderId, userId },
      select: { id: true, receiptUrl: true, receiptStoredPath: true, status: true },
    });

    if (!order) return res.status(404).json({ error: 'Ordem não encontrada' });
    if (!order.receiptUrl && !order.receiptStoredPath) {
      return res.status(404).json({ error: 'Comprovante ainda não disponível para esta ordem' });
    }

    // 1. Se já temos o PDF salvo localmente, servir direto (sem abrir nova aba, sem depender da GeraDePix)
    if (order.receiptStoredPath) {
      const filePath = getStoredReceiptPath(order.receiptStoredPath);
      if (filePath) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="comprovante-pix.pdf"');
        return res.sendFile(filePath);
      }
    }

    // 2. Tentar buscar na GeraDePix e salvar para próximas requisições
    if (order.receiptUrl && !order.receiptUrl.startsWith('/')) {
      const stored = await fetchAndStoreSendPixReceipt(orderId, order.receiptUrl);
      if (stored) {
        const filePath = getStoredReceiptPath(`send-pix-receipts/${orderId}.pdf`);
        if (filePath) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename="comprovante-pix.pdf"');
          return res.sendFile(filePath);
        }
      }

      // 3. Fallback: proxy direto (pode falhar por auth da GeraDePix)
      const apiKey = process.env.GERADEPIX_API_KEY?.trim();
      if (apiKey) {
        try {
          const url = new URL(order.receiptUrl);
          url.searchParams.set('api_key', apiKey);
          const receiptResponse = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (receiptResponse.ok) {
            const buf = await receiptResponse.arrayBuffer();
            res.setHeader('Content-Type', receiptResponse.headers.get('Content-Type') || 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="comprovante-pix.pdf"');
            return res.send(Buffer.from(buf));
          }
        } catch {
          // Continua para o erro genérico
        }
      }
    }

    return res.status(502).json({ error: 'Comprovante indisponível no momento. Tente novamente em instantes ou verifique no app da GeraDePix.' });
  } catch (err) {
    console.error('[getSendPixReceipt] Erro:', err);
    return res.status(500).json({ error: 'Erro ao baixar comprovante' });
  }
};

/** GET /depix/send-pix/:id — Status de uma ordem (para polling) */
export const getSendPixOrderStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const orderId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!orderId) return res.status(400).json({ error: 'ID da ordem é obrigatório' });

    const order = await prisma.sendPixOrder.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        amountBrl: true,
        pixKey: true,
        pixKeyType: true,
        status: true,
        statusDetail: true,
        receiptUrl: true,
        depositAddress: true,
        depositAmount: true,
        depositAmountExact: true,
        expiration: true,
        createdAt: true,
        completedAt: true,
        geradepixWithdrawalId: true,
      },
    });

    if (!order) return res.status(404).json({ error: 'Ordem não encontrada' });

    // Backfill: se ordem COMPLETED mas sem comprovante, buscar via POST /withdrawals/refresh (geradepix.fyi) ou GET status
    let receiptUrl = order.receiptUrl;
    if (
      order.status === 'COMPLETED' &&
      !receiptUrl &&
      order.geradepixWithdrawalId
    ) {
      try {
        const refresh = await refreshWithdrawalReceipt(order.geradepixWithdrawalId);
        const w = refresh.withdrawal as { receipt_url?: string; receiptUrl?: string } | undefined;
        let fetchedReceipt = w?.receipt_url ?? w?.receiptUrl;

        if (!fetchedReceipt && refresh.success) {
          const result = await getWithdrawalStatus(order.geradepixWithdrawalId);
          const gw = result.withdrawal as { receipt_url?: string; receiptUrl?: string } | undefined;
          fetchedReceipt = gw?.receipt_url ?? gw?.receiptUrl;
        }

        if (fetchedReceipt) {
          receiptUrl = fetchedReceipt;
          await prisma.sendPixOrder.update({
            where: { id: orderId },
            data: { receiptUrl },
          });
          fetchAndStoreSendPixReceipt(orderId, fetchedReceipt).catch(() => {});
        }
      } catch (err) {
        console.warn(`[getSendPixOrderStatus] Erro ao buscar comprovante da ordem ${orderId}:`, (err as Error)?.message);
      }
    }

    const { geradepixWithdrawalId: _g, ...rest } = order;
    const depositAmountExact = order.depositAmountExact
      ?? (order.depositAmount != null ? formatDepositAmountExact(order.depositAmount) : undefined);

    // Evitar cache para que "Buscar comprovante" sempre traga resposta atualizada
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    return res.json({ ...rest, receiptUrl, depositAmountExact });
  } catch (error) {
    console.error('[getSendPixOrderStatus] Erro:', error);
    return res.status(500).json({ error: 'Erro ao buscar ordem' });
  }
};

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 6000;

/**
 * POST /depix/send-pix
 * Qualquer usuário logado pode criar ordem de Depix→Pix via GeraDePix.
 */
export const createSendPixOrder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { amount, pixKey, pixKeyType } = req.body as {
      amount: number;
      pixKey: string;
      pixKeyType?: string;
    };

    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'Valor (amount) é obrigatório' });
    }
    const amountBrl = Number(amount);
    if (amountBrl < MIN_AMOUNT) {
      return res.status(400).json({ error: `Valor mínimo é R$ ${MIN_AMOUNT.toFixed(2)}` });
    }
    if (amountBrl > MAX_AMOUNT) {
      return res.status(400).json({ error: `Valor máximo é R$ ${MAX_AMOUNT.toFixed(2)}` });
    }
    if (!pixKey || typeof pixKey !== 'string' || !pixKey.trim()) {
      return res.status(400).json({ error: 'Chave PIX é obrigatória' });
    }

    const order = await prisma.sendPixOrder.create({
      data: {
        userId,
        amountBrl,
        pixKey: pixKey.trim(),
        pixKeyType: pixKeyType?.trim() || null,
        status: 'PENDING',
      },
    });

    const baseUrl = (process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/api/webhook/geradepix`;

    const result = await createWithdrawal({
      amount: amountBrl,
      pixKey: pixKey.trim(),
      pixKeyType: (pixKeyType as 'cpf' | 'cnpj' | 'email' | 'phone' | 'random') || undefined,
      reference: order.id, // Webhook usará para atualizar SendPixOrder
      description: `Enviar Pix - Pedido ${order.id.slice(0, 8)}`,
      webhookUrl,
    });

    if (!result.success || !result.withdrawal) {
      await prisma.sendPixOrder.update({
        where: { id: order.id },
        data: { status: 'FAILED' },
      });
      return res.status(400).json({
        error: result.error || 'Erro ao criar ordem no GeraDePix',
      });
    }

    const w = result.withdrawal;

    const depositAmountExact = formatDepositAmountExact(w.deposit_amount);

    await prisma.sendPixOrder.update({
      where: { id: order.id },
      data: {
        geradepixWithdrawalId: w.withdrawal_id,
        depositAddress: w.deposit_address,
        depositAmount: w.deposit_amount,
        depositAmountExact,
        expiration: new Date(w.expiration),
      },
    });

    return res.status(201).json({
      success: true,
      order: {
        id: order.id,
        amountBrl,
        depositAddress: w.deposit_address,
        depositAmount: w.deposit_amount,
        depositAmountExact,
        expiration: w.expiration,
        status: 'PENDING',
      },
      message: 'Envie o valor em Depix para o endereço indicado. O Pix será enviado automaticamente após a confirmação. Taxa GeraDePix: ~1%.',
    });
  } catch (error) {
    console.error('[createSendPixOrder] Erro:', error);
    return res.status(500).json({
      error: (error as Error).message?.includes('GERADEPIX_API_KEY')
        ? 'Serviço temporariamente indisponível. Tente mais tarde.'
        : 'Erro ao criar ordem',
    });
  }
};
