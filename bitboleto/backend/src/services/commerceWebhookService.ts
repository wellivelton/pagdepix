import { createHmac } from 'crypto';
import { prisma } from '../prisma';
import { forwardToDepixCore } from './depixcoreForwarder';

export function signCommerceWebhookPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Chamado quando um DepixOrder de um CommerceLink é pago.
 * Atualiza CommerceCharge (se existir) e dispara webhooks charge.paid.
 */
export async function onCommerceLinkPaymentPaid(
  commerceLinkId: string,
  depixOrderId: string,
  amount: number,
  paidAt: Date
): Promise<void> {
  const charge = await prisma.commerceCharge.findFirst({
    where: { commerceLinkId },
    include: { partner: true },
  });
  if (!charge || charge.status === 'paid') return;

  await prisma.commerceCharge.update({
    where: { id: charge.id },
    data: { status: 'paid', depixOrderId, paidAt },
  });

  const endpoints = await prisma.commerceWebhookEndpoint.findMany({
    where: {
      partnerId: charge.partnerId,
      isActive: true,
      events: { has: 'charge.paid' },
    },
  });

  const payload = {
    id: charge.id,
    amount,
    status: 'paid',
    paid_at: paidAt.toISOString(),
    metadata: (charge.metadata as Record<string, unknown>) || {},
  };

  for (const ep of endpoints) {
    dispatchCommerceWebhook(ep.url, ep.secret, 'charge.paid', payload).catch(() => {});
  }

  // Encaminha para o DepixCore (captura todas as cobranças pagas)
  forwardToDepixCore('charge.paid', charge.id, 'charge', {
    ...payload,
    partnerId: charge.partnerId,
  }, false).catch(() => {});
}

export async function dispatchCommerceWebhook(
  url: string,
  secret: string,
  event: string,
  data: Record<string, unknown>
) {
  const payload = JSON.stringify({ event, data });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signCommerceWebhookPayload(`${timestamp}.${payload}`, secret);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PagDepix-Signature': `sha256=${signature}`,
        'X-PagDepix-Event': event,
        'X-PagDepix-Timestamp': String(timestamp),
      },
      body: payload,
    });
    if (!res.ok) {
      console.warn(`[commerceWebhook] ${event} -> ${url} status=${res.status}`);
    }
  } catch (err: any) {
    console.error(`[commerceWebhook] ${event} -> ${url} error:`, err?.message);
  }
}
