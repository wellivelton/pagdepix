import { createHmac } from 'crypto';
import { prisma } from '../prisma';
import { forwardToDepixCore } from './depixcoreForwarder';

export type WebhookEvent =
  | 'payment.received'
  | 'payment.approved'
  | 'payment.refused'
  | 'recharge.completed'
  | 'recharge.refused'
  | 'pix.received'
  | 'pix.approved'
  | 'pix.refused';

/** Estratégia de retry: 1ª imediata, 2ª 30s, 3ª 2min, 4ª 10min, 5ª 1h */
const RETRY_DELAYS_SEC = [0, 30, 120, 600, 3600];

const WEBHOOK_TIMEOUT_MS = 5000; // 5 segundos
const DUPLICATE_WINDOW_MINUTES = 10;

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export interface WebhookPayloadData {
  recharge_id?: string;
  boleto_id?: string;
  txid?: string;
  amount?: number;
  totalAmount?: number;
  status?: string;
  timestamp?: string;
  [key: string]: any;
}

interface WebhookPayload {
  event: WebhookEvent;
  transactionId: string;
  type: 'boleto' | 'recharge' | 'pix-copia-cola';
  data: WebhookPayloadData;
  timestamp: string;
  isSandbox: boolean;
}

function normalizePayloadData(
  event: WebhookEvent,
  transactionId: string,
  type: 'boleto' | 'recharge' | 'pix-copia-cola',
  data: Record<string, any>
): WebhookPayloadData {
  const base: WebhookPayloadData = {
    ...data,
    timestamp: new Date().toISOString(),
  };
  if (type === 'recharge') {
    base.recharge_id = transactionId;
    base.status = event === 'recharge.completed' ? 'completed' : event === 'recharge.refused' ? 'refused' : data.status || 'pending';
  } else if (type === 'pix-copia-cola') {
    base.pix_id = transactionId;
    base.status = event === 'pix.approved' ? 'approved' : event === 'pix.refused' ? 'refused' : data.status || 'pending';
  } else {
    base.boleto_id = transactionId;
    base.status = event === 'payment.approved' ? 'approved' : event === 'payment.refused' ? 'refused' : data.status || 'pending';
  }
  return base;
}

export async function dispatchWebhook(
  event: WebhookEvent,
  transactionId: string,
  type: 'boleto' | 'recharge' | 'pix-copia-cola',
  data: Record<string, any>,
  apiKeyId: string | null,
  isSandbox: boolean = false
): Promise<void> {
  // Encaminha para o DepixCore independente de apiKeyId (captura todos os eventos)
  forwardToDepixCore(event, transactionId, type, data, isSandbox).catch(() => {});

  if (!apiKeyId) return;

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      apiKeyId,
      isActive: true,
      events: { has: event },
    },
  });

  if (endpoints.length === 0) return;

  const payloadData = normalizePayloadData(event, transactionId, type, data);
  const payload: WebhookPayload = {
    event,
    transactionId,
    type,
    data: payloadData,
    timestamp: new Date().toISOString(),
    isSandbox,
  };

  const payloadStr = JSON.stringify(payload);

  for (const endpoint of endpoints) {
    try {
      // Proteção contra duplicados: não enviar se já entregamos o mesmo evento+transação recentemente
      const recentCutoff = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000);
      const existing = await prisma.webhookDelivery.findFirst({
        where: {
          endpointId: endpoint.id,
          event,
          transactionId,
          createdAt: { gte: recentCutoff },
        },
      });
      if (existing) {
        continue;
      }

      await prisma.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          event,
          transactionId,
          payload: payloadStr,
          attempts: 0,
          maxAttempts: 5,
          nextRetryAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`[Webhook] Error queuing delivery for endpoint ${endpoint.id}:`, err);
    }
  }

  processDeliveryQueue().catch((err) =>
    console.error('[Webhook] Background queue processing error:', err)
  );
}

async function getRetryDelaySeconds(attempts: number): Promise<number> {
  const idx = Math.min(attempts, RETRY_DELAYS_SEC.length - 1);
  return RETRY_DELAYS_SEC[idx];
}

async function attemptDelivery(deliveryId: string): Promise<boolean> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });

  if (!delivery || !delivery.endpoint) return false;

  const signature = signPayload(delivery.payload, delivery.endpoint.secret);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    const response = await fetch(delivery.endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PagDepix-Signature': signature,
        'X-PagDepix-Event': delivery.event,
        'X-PagDepix-Delivery-Id': delivery.id,
        'User-Agent': 'PagDepix-Webhook/1.0',
      },
      body: delivery.payload,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text().catch(() => '');

    if (response.ok) {
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          responseStatus: response.status,
          responseBody: responseBody.slice(0, 1000),
          attempts: { increment: 1 },
          deliveredAt: new Date(),
          nextRetryAt: null,
        },
      });
      return true;
    }

    const attempts = delivery.attempts + 1;
    const delaySec = await getRetryDelaySeconds(attempts);
    const nextRetry = attempts >= delivery.maxAttempts
      ? null
      : new Date(Date.now() + delaySec * 1000);

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        responseStatus: response.status,
        responseBody: responseBody.slice(0, 1000),
        attempts,
        nextRetryAt: nextRetry,
        failedAt: attempts >= delivery.maxAttempts ? new Date() : null,
      },
    });

    return false;
  } catch (err: any) {
    const attempts = delivery.attempts + 1;
    const delaySec = await getRetryDelaySeconds(attempts);
    const nextRetry = attempts >= delivery.maxAttempts
      ? null
      : new Date(Date.now() + delaySec * 1000);

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        responseStatus: 0,
        responseBody: (err.message || 'Connection failed').slice(0, 1000),
        attempts,
        nextRetryAt: nextRetry,
        failedAt: attempts >= delivery.maxAttempts ? new Date() : null,
      },
    });

    return false;
  }
}

export async function processDeliveryQueue(): Promise<void> {
  const pending = await prisma.webhookDelivery.findMany({
    where: {
      deliveredAt: null,
      failedAt: null,
      nextRetryAt: { lte: new Date() },
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  for (const delivery of pending) {
    await attemptDelivery(delivery.id);
  }
}

let retryInterval: ReturnType<typeof setInterval> | null = null;

export function startWebhookRetryWorker(intervalMs: number = 30000): void {
  if (retryInterval) return;
  retryInterval = setInterval(() => {
    processDeliveryQueue().catch((err) =>
      console.error('[Webhook Retry] Error:', err)
    );
  }, intervalMs);
  console.log(`[Webhook] Retry worker started (interval: ${intervalMs}ms)`);
}

export function stopWebhookRetryWorker(): void {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
}
