/**
 * Notificações de pedido - email, in-app.
 * Eventos: pedido pago, enviado, entregue, disputa, mensagem.
 */

import { prisma } from '../../prisma';

export type NotificationType =
  | 'ORDER_PAID'
  | 'ORDER_CANCELLED'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_SELLER_RESPONSE'
  | 'DISPUTE_RESOLVED'
  | 'CHAT_MESSAGE'
  | 'PRODUCT_APPROVED'
  | 'PRODUCT_REJECTED';

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  marketOrderId?: string;
  title: string;
  body?: string;
  channel?: 'email' | 'push' | 'inapp';
}) {
  const channel = params.channel ?? 'inapp';

  const notification = await prisma.orderNotification.create({
    data: {
      userId: params.userId,
      marketOrderId: params.marketOrderId ?? null,
      type: params.type,
      channel,
      title: params.title,
      body: params.body ?? null,
    },
  });

  if (channel === 'email' && params.body) {
    const { sendGenericEmail } = await import('../email.service');
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { email: true } });
    if (user?.email) {
      try {
        await sendGenericEmail(user.email, params.title, params.body);
        await prisma.orderNotification.update({
          where: { id: notification.id },
          data: { sentAt: new Date() },
        });
      } catch (e) {
        console.error('[Notification] Email falhou:', e);
      }
    }
  }

  return notification;
}

export async function notifyOrderPaid(marketOrderId: string): Promise<void> {
  const order = await prisma.marketOrder.findUnique({
    where: { id: marketOrderId },
    include: { buyer: { select: { id: true } } },
  });
  if (!order) return;

  await createNotification({
    userId: order.buyerId,
    type: 'ORDER_PAID',
    marketOrderId,
    title: 'Pagamento confirmado',
    body: `Seu pedido #${marketOrderId.slice(0, 8)} foi pago. Em breve você receberá seus itens.`,
    channel: 'email',
  });
}

