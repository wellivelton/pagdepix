/**
 * Cancelamento de pedido - antes/depois do envio.
 * Antes do envio: refund automático.
 * Após envio: disputa.
 */

import { prisma } from '../../prisma';
import { createAuditLog } from './auditLog.service';

export async function requestCancellation(params: {
  marketOrderId: string;
  requestedBy: string;
  reason: string;
}) {
  const order = await prisma.marketOrder.findUnique({
    where: { id: params.marketOrderId },
    include: { sellerOrders: true },
  });

  if (!order) throw new Error('Pedido não encontrado');
  if (order.buyerId !== params.requestedBy) throw new Error('Apenas o comprador pode cancelar');

  const allowedStatuses = ['CREATED', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING'];
  if (!allowedStatuses.includes(order.orderStatus)) {
    throw new Error('Este pedido não pode mais ser cancelado');
  }

  const existing = await prisma.orderCancellation.findFirst({
    where: { marketOrderId: params.marketOrderId, status: 'PENDING' },
  });
  if (existing) throw new Error('Já existe solicitação de cancelamento em aberto');

  const cancel = await prisma.orderCancellation.create({
    data: {
      marketOrderId: params.marketOrderId,
      reason: params.reason,
      status: 'PENDING',
      requestedBy: params.requestedBy,
    },
  });

  await createAuditLog({
    entityType: 'MarketOrder',
    entityId: params.marketOrderId,
    action: 'CANCELLATION_REQUESTED',
    userId: params.requestedBy,
    details: { cancellationId: cancel.id, reason: params.reason },
  });

  return cancel;
}

export async function approveCancellation(params: {
  cancellationId: string;
  approvedBy: string;
  refundAmount?: number;
}) {
  const cancel = await prisma.orderCancellation.findUnique({
    where: { id: params.cancellationId },
    include: { marketOrder: { include: { sellerOrders: { include: { items: true } } } } },
  });

  if (!cancel || cancel.status !== 'PENDING') throw new Error('Solicitação inválida ou já processada');

  const order = cancel.marketOrder;

  // Liberar reserva de estoque se ainda não pago
  if (order.paymentStatus !== 'paid') {
    for (const so of order.sellerOrders) {
      for (const item of so.items) {
        if (item.variantId) {
          await prisma.productVariant.update({
            where: { id: item.variantId },
            data: { stockReserved: { decrement: item.quantity } },
          });
        } else {
          await prisma.product.update({
            where: { id: item.productId },
            data: { stockReserved: { decrement: item.quantity } },
          });
        }
      }
    }
  }

  const refundAmount = params.refundAmount ?? (order.paymentStatus === 'paid' ? order.totalAmount : 0);

  await prisma.$transaction([
    prisma.orderCancellation.update({
      where: { id: params.cancellationId },
      data: {
        status: 'APPROVED',
        approvedBy: params.approvedBy,
        refundAmount,
        refundedAt: refundAmount > 0 ? new Date() : null,
      },
    }),
    prisma.marketOrder.update({
      where: { id: order.id },
      data: {
        orderStatus: 'CANCELLED',
        paymentStatus: order.paymentStatus === 'paid' ? 'refunded' : order.paymentStatus,
      },
    }),
    prisma.sellerOrder.updateMany({
      where: { marketOrderId: order.id },
      data: { status: 'CANCELLED' },
    }),
  ]);

  await createAuditLog({
    entityType: 'MarketOrder',
    entityId: order.id,
    action: 'CANCELLATION_APPROVED',
    userId: params.approvedBy,
    details: { cancellationId: params.cancellationId, refundAmount },
  });

  return { success: true, refundAmount };
}
