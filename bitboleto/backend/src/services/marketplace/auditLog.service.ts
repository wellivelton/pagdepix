/**
 * Audit Log - registra ações críticas do marketplace.
 */

import { prisma } from '../../prisma';

export interface AuditInput {
  entityType: string;
  entityId: string;
  action: string;
  userId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export async function createAuditLog(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      userId: input.userId ?? null,
      details: (input.details ?? undefined) as object | undefined,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function listAuditLogs(params: {
  entityType?: string;
  entityId?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};
  if (params.entityType) where.entityType = params.entityType;
  if (params.entityId) where.entityId = params.entityId;
  if (params.userId) where.userId = params.userId;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}
