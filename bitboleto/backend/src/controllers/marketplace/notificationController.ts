import { Request, Response } from 'express';
import { prisma } from '../../prisma';

export const listMyNotifications = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { limit = '20', offset = '0', unreadOnly } = req.query;
  try {
    const take = Math.min(50, parseInt(String(limit), 10) || 20);
    const skip = parseInt(String(offset), 10) || 0;
    const where: { userId: string; readAt?: null } = { userId };
    if (unreadOnly === 'true') where.readAt = null;

    const [notifications, total] = await Promise.all([
      prisma.orderNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.orderNotification.count({ where }),
    ]);
    return res.json({ notifications, total });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Erro ao listar notificações' });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  const idStr = String(id);
  try {
    const n = await prisma.orderNotification.findFirst({
      where: { id: idStr, userId },
    });
    if (!n) return res.status(404).json({ error: 'Notificação não encontrada' });
    await prisma.orderNotification.update({
      where: { id: idStr },
      data: { readAt: new Date() },
    });
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Erro' });
  }
};
