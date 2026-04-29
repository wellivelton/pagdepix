import { Request, Response } from 'express';
import { handleIncomingWebhook, PagDepixWebhookPayload } from '../services/eventCollector';
import { prisma } from '../prisma';

/**
 * POST /depixcore/webhook
 *
 * Recebe eventos do PagDepix, valida (HMAC já validado pelo middleware),
 * armazena e processa.
 */
export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  const deliveryId = req.headers['x-pagdepix-delivery-id'] as string | undefined;
  const eventHeader = req.headers['x-pagdepix-event'] as string | undefined;
  const rawBody: string = (req as any).rawBody?.toString('utf8') || JSON.stringify(req.body);

  // Responder 200 imediatamente (o PagDepix não aguarda processamento)
  // O processamento acontece de forma assíncrona
  res.status(200).json({ received: true });

  // Validação mínima do payload
  const payload = req.body as PagDepixWebhookPayload;
  if (!payload?.event || !payload?.transactionId) {
    console.warn('[Webhook] ⚠️  Payload inválido recebido:', JSON.stringify(payload).substring(0, 200));
    await logAudit(req, 200, 'Payload inválido (event ou transactionId ausente)', eventHeader, deliveryId);
    return;
  }

  console.log(`[Webhook] 📥 Recebido: ${payload.event} | tx=${payload.transactionId} | delivery=${deliveryId || 'sem-id'}`);

  try {
    const result = await handleIncomingWebhook(payload, deliveryId, rawBody);

    await logAudit(req, 200, null, payload.event, deliveryId, result.rawEventId);

    if (result.alreadyExists) {
      console.log(`[Webhook] ♻️  Evento duplicado ignorado (idempotência): ${deliveryId}`);
    } else {
      console.log(`[Webhook] ✅ Processado: ${payload.event} | rawEventId=${result.rawEventId}`);
    }
  } catch (err) {
    console.error('[Webhook] ❌ Erro ao processar webhook:', err);
    await logAudit(req, 500, err instanceof Error ? err.message : String(err), eventHeader, deliveryId);
  }
}

/**
 * GET /depixcore/webhook/status
 * Endpoint de saúde para o PagDepix verificar conectividade.
 */
export async function webhookStatus(_req: Request, res: Response): Promise<void> {
  try {
    const [totalEvents, lastEvent] = await Promise.all([
      prisma.eventRaw.count(),
      prisma.eventRaw.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { eventType: true, createdAt: true },
      }),
    ]);

    res.json({
      status: 'ready',
      totalEventsReceived: totalEvents,
      lastEventAt: lastEvent?.createdAt || null,
      lastEventType: lastEvent?.eventType || null,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ status: 'error' });
  }
}

async function logAudit(
  req: Request,
  statusCode: number,
  error: string | null,
  eventType?: string,
  deliveryId?: string,
  rawEventId?: string
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        method: req.method,
        path: req.path,
        ip: req.ip || req.socket?.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
        statusCode,
        error,
        eventType: eventType || null,
        deliveryId: deliveryId || null,
        rawEventId: rawEventId || null,
      },
    });
  } catch (err) {
    console.error('[Webhook] Erro ao registrar AuditLog:', err);
  }
}
