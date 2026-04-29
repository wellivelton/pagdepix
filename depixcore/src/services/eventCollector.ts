import { prisma } from '../prisma';
import { updateDailyAggregation } from './aggregationService';

// ============================================================
// TIPOS DO PAYLOAD DO PAGDEPIX
// Baseado na auditoria do webhookService.ts do PagDepix
// ============================================================

export type PagDepixEventType =
  | 'payment.received'
  | 'payment.approved'
  | 'payment.refused'
  | 'recharge.completed'
  | 'recharge.refused'
  | 'charge.paid';

export interface PagDepixWebhookPayload {
  event: PagDepixEventType;
  transactionId: string;
  type: 'boleto' | 'recharge' | 'charge';
  data: Record<string, unknown>;
  timestamp: string;
  isSandbox: boolean;
}

/**
 * Custo Eueln: 1% sobre a RECEITA BRUTA (fee cobrado do usuário).
 *
 * Fluxo financeiro:
 *   Usuário paga (boleto + taxa) em cripto → vai para Eueln
 *   Eueln converte e cobra 1% sobre a taxa (receita da empresa)
 *   Fiat líquido → RecargaPay → liquida o boleto/recarga
 *
 * Fórmula: custo_eueln = fee × 0.01
 * Receita líquida = fee × 0.99
 */
function estimateCost(fee: number): number {
  return Math.round(fee * 0.01 * 100) / 100;
}

// ============================================================
// STORE RAW EVENT
// Armazena o evento bruto com idempotência por deliveryId.
// Retorna null se o evento já foi recebido antes.
// ============================================================
export async function storeRawEvent(
  payload: PagDepixWebhookPayload,
  deliveryId: string | undefined,
  rawBody: string
): Promise<{ id: string; alreadyExists: boolean }> {
  const eventType = payload.event;
  const transactionId = payload.transactionId || null;

  // Extrair txid do payload (campo txid dentro de data)
  const txid = (payload.data?.txid as string) || null;
  const isSandbox = Boolean(payload.isSandbox);

  // Idempotência: se deliveryId já existe, não duplicar
  if (deliveryId) {
    const existing = await prisma.eventRaw.findUnique({
      where: { deliveryId },
      select: { id: true },
    });
    if (existing) {
      console.log(`[EventCollector] ♻️  Evento duplicado ignorado: deliveryId=${deliveryId}`);
      return { id: existing.id, alreadyExists: true };
    }
  }

  const raw = await prisma.eventRaw.create({
    data: {
      eventType,
      source: 'pagdepix',
      payloadJson: rawBody,
      transactionId,
      txid,
      isSandbox,
      deliveryId: deliveryId || null,
      processed: false,
    },
  });

  console.log(`[EventCollector] ✅ Evento armazenado: ${eventType} | id=${raw.id} | tx=${transactionId}`);
  return { id: raw.id, alreadyExists: false };
}

// ============================================================
// PROCESS EVENT
// Extrai dados financeiros e cria EventProcessed + atualiza agregação.
// ============================================================
export async function processEvent(
  rawEventId: string,
  payload: PagDepixWebhookPayload
): Promise<void> {
  const { event: eventType, type: transactionType, data, isSandbox, timestamp } = payload;

  // Extrair campos financeiros do data
  const amount = parseFloat(String(data.amount || data.boleto_amount || 0)) || null;
  const fee = parseFloat(String(data.fee || 0)) || null;
  const totalAmount = parseFloat(String(data.totalAmount || data.total_amount || 0)) || null;
  const txid = (data.txid as string) || null;
  const status = (data.status as string) || null;
  const externalRef = (data.externalRef as string) || (data.external_ref as string) || null;
  const currency = (data.paymentCurrency as string) || (data.currency as string) || null;
  const cryptoAmount = (data.cryptoAmount as string) || null;
  const exchangeRate = parseFloat(String(data.exchangeRate || 0)) || null;

  // Custo estimado e lucro líquido (calculado apenas em eventos financeiros)
  let cost: number | null = null;
  let netProfit: number | null = null;

  // Custo só é calculado em eventos com receita real (fee > 0)
  if (fee !== null && fee > 0) {
    cost = estimateCost(fee);
    netProfit = Math.round((fee - cost) * 100) / 100;
  }

  let eventTimestamp: Date | null = null;
  try {
    eventTimestamp = timestamp ? new Date(timestamp) : null;
  } catch {
    eventTimestamp = null;
  }

  const transactionId = payload.transactionId || null;

  await prisma.eventProcessed.create({
    data: {
      rawEventId,
      eventType,
      transactionType: transactionType || 'boleto',
      transactionId,
      txid,
      amount,
      fee,
      totalAmount,
      cost,
      netProfit,
      externalRef,
      status,
      currency,
      cryptoAmount,
      exchangeRate,
      isSandbox: Boolean(isSandbox),
      eventTimestamp,
    },
  });

  // Marcar raw como processado
  await prisma.eventRaw.update({
    where: { id: rawEventId },
    data: { processed: true, processedAt: new Date() },
  });

  // Atualizar agregação diária
  await updateDailyAggregation(eventType, {
    amount,
    fee,
    cost,
    netProfit,
    transactionType: transactionType || 'boleto',
    isSandbox: Boolean(isSandbox),
  });

  console.log(`[EventCollector] 📊 Evento processado: ${eventType} | fee=${fee} | profit=${netProfit}`);
}

// ============================================================
// HANDLE INCOMING WEBHOOK
// Ponto de entrada principal: armazena + processa de forma atômica.
// ============================================================
export async function handleIncomingWebhook(
  payload: PagDepixWebhookPayload,
  deliveryId: string | undefined,
  rawBody: string
): Promise<{ success: boolean; alreadyExists: boolean; rawEventId: string }> {
  const { id: rawEventId, alreadyExists } = await storeRawEvent(payload, deliveryId, rawBody);

  if (alreadyExists) {
    return { success: true, alreadyExists: true, rawEventId };
  }

  try {
    await processEvent(rawEventId, payload);
  } catch (err) {
    console.error(`[EventCollector] ❌ Erro ao processar evento ${rawEventId}:`, err);

    // Registrar erro no rawEvent para reprocessamento futuro
    await prisma.eventRaw.update({
      where: { id: rawEventId },
      data: {
        processError: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
  }

  return { success: true, alreadyExists: false, rawEventId };
}
