/**
 * Antifraude - regras: mesmo IP, mesmo CPF, chargebacks.
 */

import { prisma } from '../../prisma';

export type FraudType =
  | 'MULTIPLE_ORDERS_SAME_IP'
  | 'SAME_CPF_MULTIPLE_ACCOUNTS'
  | 'HIGH_CHARGEBACK_RATE'
  | 'SUSPICIOUS_ACTIVITY';

export async function createFraudFlag(params: {
  userId?: string;
  orderId?: string;
  type: FraudType;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  details?: Record<string, unknown>;
}) {
  return prisma.fraudFlag.create({
    data: {
      userId: params.userId ?? null,
      orderId: params.orderId ?? null,
      type: params.type,
      severity: params.severity ?? 'medium',
      details: (params.details ?? undefined) as object | undefined,
    },
  });
}

export async function checkFraudBeforeCheckout(params: {
  buyerId: string;
  ip?: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: params.buyerId },
    select: { id: true },
  });
  if (!user) return { allowed: false, reason: 'Usuário não encontrado' };

  // Verificar se usuário tem flag não resolvida
  const flag = await prisma.fraudFlag.findFirst({
    where: {
      userId: params.buyerId,
      resolved: false,
      severity: { in: ['high', 'critical'] },
    },
  });
  if (flag) {
    return { allowed: false, reason: 'Operação bloqueada por política de segurança. Entre em contato com o suporte.' };
  }

  // Mesmo IP muitas compras (últimas 24h)
  if (params.ip) {
    const recentOrders = await prisma.marketOrder.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    // Poderia checar por IP se tivéssemos IP por pedido - por ora não temos
  }

  return { allowed: true };
}
