import { Request, Response } from 'express';
import * as auditLogService from '../../services/marketplace/auditLog.service';

export const listAuditLogs = async (req: Request, res: Response) => {
  const role = (req as any).userRole;
  if (role !== 'ADMIN') return res.status(403).json({ error: 'Apenas admin' });
  const { entityType, entityId, userId, limit, offset } = req.query;
  try {
    const result = await auditLogService.listAuditLogs({
      entityType: typeof entityType === 'string' ? entityType : undefined,
      entityId: typeof entityId === 'string' ? entityId : undefined,
      userId: typeof userId === 'string' ? userId : undefined,
      limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
      offset: typeof offset === 'string' ? parseInt(offset, 10) : undefined,
    });
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Erro' });
  }
};
