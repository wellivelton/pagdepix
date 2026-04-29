/**
 * Devolução - fluxo: cliente solicita, vendedor aprova, refund.
 */

import { prisma } from '../../prisma';
import { createAuditLog } from './auditLog.service';

export async function requestReturn(params: {
  sellerOrderId: string;
  orderItemId?: string;
  reason: string;
  requestedBy: string;
}) {
  const so = await prisma.sellerOrder.findUnique({
    where: { id: params.sellerOrderId },
    include: {
      marketOrder: { select: { buyerId: true } },
      items: true,
    },
  });

  if (!so) throw new Error('Pedido não encontrado');
  if (so.marketOrder.buyerId !== params.requestedBy) throw new Error('Apenas o comprador pode solicitar devolução');

  const allowedStatuses = ['COMPLETED'];
  if (!allowedStatuses.includes(so.status)) {
    throw new Error('Este pedido não pode receber solicitação de devolução');
  }

  const existing = await prisma.returnRequest.findFirst({
    where: {
      sellerOrderId: params.sellerOrderId,
      status: 'PENDING',
    },
  });
  if (existing) throw new Error('Já existe solicitação de devolução em aberto');

  return prisma.returnRequest.create({
    data: {
      sellerOrderId: params.sellerOrderId,
      orderItemId: params.orderItemId ?? null,
      reason: params.reason,
      status: 'PENDING',
    },
  });
}

export async function approveReturn(params: {
  returnId: string;
  approvedBy: string;
  refundAmount?: number;
}) {
  const rr = await prisma.returnRequest.findUnique({
    where: { id: params.returnId },
    include: {
      sellerOrder: {
        include: { marketOrder: true },
      },
    },
  });

  if (!rr || rr.status !== 'PENDING') throw new Error('Solicitação inválida ou já processada');

  const refundAmount = params.refundAmount ?? rr.sellerOrder.sellerReceives;

  await prisma.$transaction([
    prisma.returnRequest.update({
      where: { id: params.returnId },
      data: {
        status: 'APPROVED',
        approvedBy: params.approvedBy,
        refundAmount,
        refundedAt: new Date(),
      },
    }),
    prisma.sellerOrder.update({
      where: { id: rr.sellerOrderId },
      data: { status: 'REFUNDED' },
    }),
  ]);

  await createAuditLog({
    entityType: 'ReturnRequest',
    entityId: params.returnId,
    action: 'RETURN_APPROVED',
    userId: params.approvedBy,
    details: { refundAmount },
  });

  return { success: true, refundAmount };
}
