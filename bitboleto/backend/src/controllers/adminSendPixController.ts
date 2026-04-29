/**
 * Admin: Auditoria de Enviar PIX (Depix→Pix via GeraDePix)
 * Listagem, detalhes e sincronização manual de status.
 */
import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { getWithdrawalStatus } from '../services/geradepixService';
import { fetchAndStoreSendPixReceipt, getStoredReceiptPath } from '../services/sendPixReceiptStorage';

/** GET /admin/send-pix-orders — Lista ordens Enviar PIX com filtros */
export const listAdminSendPixOrders = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const raw = req.query;
    const status = typeof raw.status === 'string' ? raw.status : undefined;
    const startDate = typeof raw.startDate === 'string' ? raw.startDate : undefined;
    const endDate = typeof raw.endDate === 'string' ? raw.endDate : undefined;
    const userId = typeof raw.userId === 'string' ? raw.userId : undefined;
    const page = raw.page ?? 1;
    const limit = raw.limit ?? 50;

    const where: any = {};
    if (status?.trim()) where.status = status.trim();
    if (userId?.trim()) where.userId = userId.trim();
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        where.createdAt.lte = d;
      }
    }

    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(100, Math.max(10, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      prisma.sendPixOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        include: {
          user: { select: { id: true, name: true, email: true, telegram: true } },
        },
      }),
      prisma.sendPixOrder.count({ where }),
    ]);

    return res.json({
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[listAdminSendPixOrders] Erro:', error);
    return res.status(500).json({ error: 'Erro ao listar ordens Enviar PIX' });
  }
};

/** GET /admin/send-pix-orders/:id — Detalhes de uma ordem para auditoria */
export const getAdminSendPixOrder = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const orderId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!orderId) return res.status(400).json({ error: 'ID da ordem é obrigatório' });
    const order = await prisma.sendPixOrder.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, name: true, email: true, telegram: true, createdAt: true } },
      },
    });

    if (!order) return res.status(404).json({ error: 'Ordem não encontrada' });
    return res.json(order);
  } catch (error) {
    console.error('[getAdminSendPixOrder] Erro:', error);
    return res.status(500).json({ error: 'Erro ao buscar ordem' });
  }
};

/** POST /admin/send-pix-orders/:id/sync — Sincronizar status com a API GeraDePix */
export const syncSendPixOrderStatus = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const orderId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!orderId) return res.status(400).json({ error: 'ID da ordem é obrigatório' });
    const order = await prisma.sendPixOrder.findUnique({
      where: { id: orderId },
      include: { user: { select: { id: true, name: true, email: true, telegram: true } } },
    });

    if (!order) return res.status(404).json({ error: 'Ordem não encontrada' });
    if (!order.geradepixWithdrawalId) {
      return res.status(400).json({ error: 'Ordem sem ID GeraDePix. Não é possível sincronizar.' });
    }
    if (order.status !== 'PENDING') {
      return res.json({ message: 'Ordem já finalizada', order });
    }

    const result = await getWithdrawalStatus(order.geradepixWithdrawalId);
    if (!result.success || !result.withdrawal) {
      return res.status(400).json({
        error: result.error || 'Não foi possível consultar status na GeraDePix',
      });
    }

    const w = result.withdrawal;
    const statusMap: Record<string, string> = {
      completed: 'COMPLETED',
      failed: 'FAILED',
      expired: 'EXPIRED',
      canceled: 'CANCELED',
      refunded: 'REFUNDED',
      pending: 'PENDING',
      processing: 'PENDING', // mantemos PENDING até completar
    };
    const newStatus = statusMap[w.status?.toLowerCase() || ''] || order.status;

    if (newStatus !== 'PENDING') {
      const receiptUrl = (w as any).receipt_url || (w as any).receiptUrl;
      await prisma.sendPixOrder.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          completedAt: new Date(),
          receiptUrl: receiptUrl || undefined,
          statusDetail: newStatus === 'COMPLETED' ? undefined : (w as any).error_message || w.status,
        },
      });
      if (newStatus === 'COMPLETED' && receiptUrl) {
        fetchAndStoreSendPixReceipt(orderId, receiptUrl).catch((err) =>
          console.warn(`[adminSendPix] Falha ao armazenar comprovante:`, (err as Error)?.message)
        );
      }

      const updated = await prisma.sendPixOrder.findUnique({
        where: { id: orderId },
        include: { user: { select: { id: true, name: true, email: true, telegram: true } } },
      });
      return res.json({ message: 'Status sincronizado', order: updated });
    }

    return res.json({ message: 'Status ainda pendente na GeraDePix', order });
  } catch (error) {
    console.error('[syncSendPixOrderStatus] Erro:', error);
    return res.status(500).json({
      error: (error as Error).message?.includes('GERADEPIX_API_KEY')
        ? 'GeraDePix não configurada'
        : 'Erro ao sincronizar status',
    });
  }
};

/** GET /admin/send-pix-orders/:id/receipt — Download do comprovante (admin) */
export const getAdminSendPixReceipt = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const orderId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!orderId) return res.status(400).json({ error: 'ID da ordem é obrigatório' });

    const order = await prisma.sendPixOrder.findFirst({
      where: { id: orderId },
      select: { id: true, receiptUrl: true, receiptStoredPath: true },
    });

    if (!order) return res.status(404).json({ error: 'Ordem não encontrada' });
    if (!order.receiptUrl && !order.receiptStoredPath) {
      return res.status(404).json({ error: 'Comprovante ainda não disponível para esta ordem' });
    }

    if (order.receiptStoredPath) {
      const filePath = getStoredReceiptPath(order.receiptStoredPath);
      if (filePath) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="comprovante-pix.pdf"');
        return res.sendFile(filePath);
      }
    }

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
          // fallback
        }
      }
    }

    return res.status(502).json({ error: 'Comprovante indisponível no momento.' });
  } catch (err) {
    console.error('[getAdminSendPixReceipt] Erro:', err);
    return res.status(500).json({ error: 'Erro ao baixar comprovante' });
  }
};
