import { Request, Response } from 'express';
import { prisma } from '../prisma';

type PlatformNotificationTarget = 'ALL' | 'ROLES' | 'USERS';
type PlatformNotificationType = 'POPUP' | 'BANNER';
const VALID_ROLES = ['USER', 'AFFILIATE', 'COMMERCE'];

function requireAdmin(req: Request): string | null {
  const userId = (req as any).userId;
  return userId || null;
}

async function isAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === 'ADMIN';
}

/** GET /notifications/me — Notificações ativas para o usuário logado */
export const getNotificationsForMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const now = new Date();
    const notifications = await prisma.platformNotification.findMany({
      where: {
        isActive: true,
        AND: [
          {
            OR: [
              { startsAt: null },
              { startsAt: { lte: now } },
            ],
          },
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        body: true,
        imageUrl: true,
        buttonText: true,
        buttonUrl: true,
        type: true,
        targetType: true,
        targetRoles: true,
        targetUserIds: true,
      },
    });

    const filtered: any[] = [];
    for (const n of notifications) {
      let match = false;
      if (n.targetType === 'ALL') {
        match = true;
      } else if (n.targetType === 'ROLES' && Array.isArray(n.targetRoles) && n.targetRoles.includes(user.role)) {
        match = true;
      } else if (n.targetType === 'USERS' && Array.isArray(n.targetUserIds) && n.targetUserIds.includes(userId)) {
        match = true;
      }
      if (match) filtered.push(n);
    }

    const viewedIds = await prisma.platformNotificationView.findMany({
      where: {
        userId,
        notificationId: { in: filtered.map((f) => f.id) },
      },
      select: { notificationId: true },
    });
    const viewedSet = new Set(viewedIds.map((v) => v.notificationId));

    const pending = filtered.filter((n) => !viewedSet.has(n.id)).slice(0, 5);
    return res.json({ notifications: pending });
  } catch (error) {
    console.error('[getNotificationsForMe] Erro:', error);
    return res.status(500).json({ error: 'Erro ao buscar notificações' });
  }
};

/** POST /notifications/:id/view — Registra visualização */
export const recordView = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const notificationId = String(req.params?.id || '');
    if (!userId || !notificationId) return res.status(400).json({ error: 'Dados inválidos' });

    await prisma.platformNotificationView.upsert({
      where: {
        notificationId_userId: { notificationId, userId },
      },
      update: {},
      create: {
        notificationId,
        userId,
      },
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('[recordView] Erro:', error);
    return res.status(500).json({ error: 'Erro ao registrar visualização' });
  }
};

/** POST /notifications/:id/click — Registra clique no botão */
export const recordClick = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const notificationId = String(req.params?.id || '');
    if (!userId || !notificationId) return res.status(400).json({ error: 'Dados inválidos' });

    await prisma.platformNotificationView.upsert({
      where: {
        notificationId_userId: { notificationId, userId },
      },
      update: { clickedAt: new Date() },
      create: {
        notificationId,
        userId,
        clickedAt: new Date(),
      },
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('[recordClick] Erro:', error);
    return res.status(500).json({ error: 'Erro ao registrar clique' });
  }
};

/** GET /admin/notifications — Listar notificações (admin) */
export const adminList = async (req: Request, res: Response) => {
  try {
    const adminId = requireAdmin(req);
    if (!adminId || !(await isAdmin(adminId))) return res.status(403).json({ error: 'Acesso negado' });

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.platformNotification.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { views: true } },
        },
      }),
      prisma.platformNotification.count(),
    ]);

    const withMetrics = await Promise.all(
      items.map(async (n) => {
        const clicks = await prisma.platformNotificationView.count({
          where: { notificationId: n.id, clickedAt: { not: null } },
        });
        return {
          ...n,
          viewCount: n._count.views,
          clickCount: clicks,
        };
      })
    );

    return res.json({
      data: withMetrics.map(({ _count, ...rest }) => rest),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[adminList] Erro:', error);
    return res.status(500).json({ error: 'Erro ao listar notificações' });
  }
};

/** POST /admin/notifications — Criar notificação (admin) */
export const adminCreate = async (req: Request, res: Response) => {
  try {
    const adminId = requireAdmin(req);
    if (!adminId || !(await isAdmin(adminId))) return res.status(403).json({ error: 'Acesso negado' });

    const body = req.body as Record<string, unknown>;
    const baseUrl = process.env.APP_URL || (req.protocol + '://' + req.get('host') || 'http://localhost:3001');
    const imageUrl = (req as any).file
      ? `${baseUrl}/uploads/notifications/${(req as any).file.filename}`
      : (typeof body.imageUrl === 'string' ? body.imageUrl.trim() || null : null);

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const bodyText = typeof body.body === 'string' ? body.body.trim() : '';
    if (!title || !bodyText) return res.status(400).json({ error: 'Título e corpo são obrigatórios' });

    const type = (body.type === 'BANNER' ? 'BANNER' : 'POPUP') as PlatformNotificationType;
    const targetType = (body.targetType === 'ROLES' ? 'ROLES' : body.targetType === 'USERS' ? 'USERS' : 'ALL') as PlatformNotificationTarget;

    let targetRoles: string[] = [];
    let targetUserIds: string[] = [];
    if (targetType === 'ROLES') {
      const raw = body.targetRoles;
      if (Array.isArray(raw)) targetRoles = raw.filter((r: string) => VALID_ROLES.includes(r));
      else if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          targetRoles = Array.isArray(parsed) ? parsed.filter((r: string) => VALID_ROLES.includes(r)) : raw.split(',').map((r: string) => r.trim()).filter((r: string) => VALID_ROLES.includes(r));
        } catch {
          targetRoles = raw.split(',').map((r: string) => r.trim()).filter((r: string) => VALID_ROLES.includes(r));
        }
      }
    }
    if (targetType === 'USERS') {
      const raw = body.targetUserIds;
      if (Array.isArray(raw)) targetUserIds = raw.filter((id: string) => typeof id === 'string' && id.length > 0);
      else if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          targetUserIds = Array.isArray(parsed) ? parsed.filter((id: string) => typeof id === 'string' && id.length > 0) : [];
        } catch {
          targetUserIds = [];
        }
      }
    }

    const buttonText = typeof body.buttonText === 'string' ? body.buttonText.trim() || null : null;
    const buttonUrl = typeof body.buttonUrl === 'string' ? body.buttonUrl.trim() || null : null;
    const isActive = body.isActive === 'false' ? false : body.isActive !== false;
    const startsAt = body.startsAt ? new Date(String(body.startsAt)) : null;
    const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;

    const notification = await prisma.platformNotification.create({
      data: {
        title,
        body: bodyText,
        imageUrl,
        buttonText,
        buttonUrl,
        type,
        targetType,
        targetRoles,
        targetUserIds,
        isActive,
        startsAt: isNaN((startsAt as any)?.getTime?.()) ? null : startsAt,
        expiresAt: isNaN((expiresAt as any)?.getTime?.()) ? null : expiresAt,
        createdBy: adminId,
      },
    });
    return res.status(201).json(notification);
  } catch (error) {
    console.error('[adminCreate] Erro:', error);
    return res.status(500).json({ error: 'Erro ao criar notificação' });
  }
};

/** PUT /admin/notifications/:id — Editar notificação (admin) */
export const adminUpdate = async (req: Request, res: Response) => {
  try {
    const adminId = requireAdmin(req);
    if (!adminId || !(await isAdmin(adminId))) return res.status(403).json({ error: 'Acesso negado' });

    const id = String(req.params?.id || '');
    const existing = await prisma.platformNotification.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Notificação não encontrada' });

    const body = req.body as Record<string, unknown>;
    const baseUrl = process.env.APP_URL || (req.protocol + '://' + req.get('host') || 'http://localhost:3001');
    const imageUrl = (req as any).file
      ? `${baseUrl}/uploads/notifications/${(req as any).file.filename}`
      : body.imageUrl !== undefined
        ? (typeof body.imageUrl === 'string' ? body.imageUrl.trim() || null : null)
        : existing.imageUrl;

    const title = body.title !== undefined ? (typeof body.title === 'string' ? body.title.trim() : existing.title) : existing.title;
    const bodyText = body.body !== undefined ? (typeof body.body === 'string' ? body.body.trim() : existing.body) : existing.body;
    const type = body.type === 'BANNER' ? 'BANNER' : (body.type === 'POPUP' ? 'POPUP' : existing.type) as PlatformNotificationType;
    const targetType = (body.targetType === 'ROLES' ? 'ROLES' : body.targetType === 'USERS' ? 'USERS' : body.targetType === 'ALL' ? 'ALL' : existing.targetType) as PlatformNotificationTarget;

    let targetRoles = existing.targetRoles;
    let targetUserIds = existing.targetUserIds;
    if (targetType === 'ROLES' && Array.isArray(body.targetRoles)) {
      targetRoles = body.targetRoles.filter((r: string) => VALID_ROLES.includes(r));
    }
    if (targetType === 'USERS' && Array.isArray(body.targetUserIds)) {
      targetUserIds = body.targetUserIds.filter((id: string) => typeof id === 'string' && id.length > 0);
    }

    const buttonText = body.buttonText !== undefined ? (typeof body.buttonText === 'string' ? body.buttonText.trim() || null : null) : existing.buttonText;
    const buttonUrl = body.buttonUrl !== undefined ? (typeof body.buttonUrl === 'string' ? body.buttonUrl.trim() || null : null) : existing.buttonUrl;
    const isActive = body.isActive !== undefined ? !!body.isActive : existing.isActive;
    const startsAt = body.startsAt !== undefined ? (body.startsAt ? new Date(body.startsAt as string) : null) : existing.startsAt;
    const expiresAt = body.expiresAt !== undefined ? (body.expiresAt ? new Date(body.expiresAt as string) : null) : existing.expiresAt;

    const notification = await prisma.platformNotification.update({
      where: { id },
      data: {
        title,
        body: bodyText,
        imageUrl,
        buttonText,
        buttonUrl,
        type,
        targetType,
        targetRoles,
        targetUserIds,
        isActive,
        startsAt: startsAt && !isNaN(startsAt.getTime()) ? startsAt : null,
        expiresAt: expiresAt && !isNaN(expiresAt.getTime()) ? expiresAt : null,
      },
    });
    return res.json(notification);
  } catch (error) {
    console.error('[adminUpdate] Erro:', error);
    return res.status(500).json({ error: 'Erro ao atualizar notificação' });
  }
};

/** DELETE /admin/notifications/:id — Excluir notificação (admin) */
export const adminDelete = async (req: Request, res: Response) => {
  try {
    const adminId = requireAdmin(req);
    if (!adminId || !(await isAdmin(adminId))) return res.status(403).json({ error: 'Acesso negado' });

    const id = String(req.params?.id || '');
    await prisma.platformNotification.delete({ where: { id } });
    return res.json({ message: 'Notificação excluída' });
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Notificação não encontrada' });
    console.error('[adminDelete] Erro:', error);
    return res.status(500).json({ error: 'Erro ao excluir notificação' });
  }
};

/** GET /admin/notifications/:id/metrics — Métricas de uma notificação (admin) */
export const adminMetrics = async (req: Request, res: Response) => {
  try {
    const adminId = requireAdmin(req);
    if (!adminId || !(await isAdmin(adminId))) return res.status(403).json({ error: 'Acesso negado' });

    const id = String(req.params?.id || '');
    const notification = await prisma.platformNotification.findUnique({ where: { id } });
    if (!notification) return res.status(404).json({ error: 'Notificação não encontrada' });

    const notifId = String(id);
    const [viewCount, clickCount] = await Promise.all([
      prisma.platformNotificationView.count({ where: { notificationId: notifId } }),
      prisma.platformNotificationView.count({ where: { notificationId: notifId, clickedAt: { not: null } } }),
    ]);

    return res.json({
      viewCount,
      clickCount,
      conversionRate: viewCount > 0 ? Math.round((clickCount / viewCount) * 100) : 0,
    });
  } catch (error) {
    console.error('[adminMetrics] Erro:', error);
    return res.status(500).json({ error: 'Erro ao buscar métricas' });
  }
};
