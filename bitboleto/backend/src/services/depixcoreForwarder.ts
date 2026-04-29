import { createHmac, randomUUID } from 'crypto';

/**
 * Forwarder interno — envia todos os eventos do PagDepix para o DepixCore.
 *
 * Configurado via variáveis de ambiente no .env do PagDepix:
 *   DEPIXCORE_WEBHOOK_URL    = https://contabilidade.pagdepix.com/depixcore/webhook
 *   DEPIXCORE_WEBHOOK_SECRET = (mesmo valor de PAGDEPIX_WEBHOOK_SECRET no .env do DepixCore)
 *
 * Fire-and-forget: nunca lança exceção nem bloqueia o fluxo principal.
 * Loga erros mas não retenta (o DepixCore tem idempotência via deliveryId).
 */

const TIMEOUT_MS = 5000;

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export async function forwardToDepixCore(
  event: string,
  transactionId: string,
  type: 'boleto' | 'recharge' | 'charge' | 'pix-copia-cola',
  data: Record<string, unknown>,
  isSandbox: boolean = false,
  deliveryIdOverride?: string
): Promise<void> {
  const url    = process.env.DEPIXCORE_WEBHOOK_URL;
  const secret = process.env.DEPIXCORE_WEBHOOK_SECRET;

  if (!url || !url.trim()) return; // DepixCore não configurado — silencioso

  // deliveryIdOverride permite backfill idempotente (mesmo ID = não duplica no DepixCore)
  const deliveryId = deliveryIdOverride || randomUUID();
  const timestamp  = new Date().toISOString();

  const payloadObj = {
    event,
    transactionId,
    type,
    data,
    timestamp,
    isSandbox,
  };

  const payloadStr = JSON.stringify(payloadObj);
  const signature  = secret ? sign(payloadStr, secret) : '';

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PagDepix-Event':       event,
        'X-PagDepix-Delivery-Id': deliveryId,
        ...(secret ? { 'X-PagDepix-Signature': signature } : {}),
        'User-Agent': 'PagDepix-DepixCore-Forwarder/1.0',
      },
      body: payloadStr,
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[DepixCore] ⚠️  Forward ${event} status=${res.status} delivery=${deliveryId}`);
    } else {
      console.log(`[DepixCore] ✅ Forward ${event} tx=${transactionId} delivery=${deliveryId}`);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn(`[DepixCore] ⏱️  Timeout ao encaminhar ${event} (${TIMEOUT_MS}ms)`);
    } else {
      console.error(`[DepixCore] ❌ Erro ao encaminhar ${event}:`, err?.message);
    }
  } finally {
    clearTimeout(timeout);
  }
}
