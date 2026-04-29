"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeRawEvent = storeRawEvent;
exports.processEvent = processEvent;
exports.handleIncomingWebhook = handleIncomingWebhook;
const prisma_1 = require("../prisma");
const aggregationService_1 = require("./aggregationService");
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
function estimateCost(fee) {
    return Math.round(fee * 0.01 * 100) / 100;
}
// ============================================================
// STORE RAW EVENT
// Armazena o evento bruto com idempotência por deliveryId.
// Retorna null se o evento já foi recebido antes.
// ============================================================
async function storeRawEvent(payload, deliveryId, rawBody) {
    const eventType = payload.event;
    const transactionId = payload.transactionId || null;
    // Extrair txid do payload (campo txid dentro de data)
    const txid = payload.data?.txid || null;
    const isSandbox = Boolean(payload.isSandbox);
    // Idempotência: se deliveryId já existe, não duplicar
    if (deliveryId) {
        const existing = await prisma_1.prisma.eventRaw.findUnique({
            where: { deliveryId },
            select: { id: true },
        });
        if (existing) {
            console.log(`[EventCollector] ♻️  Evento duplicado ignorado: deliveryId=${deliveryId}`);
            return { id: existing.id, alreadyExists: true };
        }
    }
    const raw = await prisma_1.prisma.eventRaw.create({
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
async function processEvent(rawEventId, payload) {
    const { event: eventType, type: transactionType, data, isSandbox, timestamp } = payload;
    // Extrair campos financeiros do data
    const amount = parseFloat(String(data.amount || data.boleto_amount || 0)) || null;
    const fee = parseFloat(String(data.fee || 0)) || null;
    const totalAmount = parseFloat(String(data.totalAmount || data.total_amount || 0)) || null;
    const txid = data.txid || null;
    const status = data.status || null;
    const externalRef = data.externalRef || data.external_ref || null;
    const currency = data.paymentCurrency || data.currency || null;
    const cryptoAmount = data.cryptoAmount || null;
    const exchangeRate = parseFloat(String(data.exchangeRate || 0)) || null;
    // Custo estimado e lucro líquido (calculado apenas em eventos financeiros)
    let cost = null;
    let netProfit = null;
    // Custo só é calculado em eventos com receita real (fee > 0)
    if (fee !== null && fee > 0) {
        cost = estimateCost(fee);
        netProfit = Math.round((fee - cost) * 100) / 100;
    }
    let eventTimestamp = null;
    try {
        eventTimestamp = timestamp ? new Date(timestamp) : null;
    }
    catch {
        eventTimestamp = null;
    }
    const transactionId = payload.transactionId || null;
    await prisma_1.prisma.eventProcessed.create({
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
    await prisma_1.prisma.eventRaw.update({
        where: { id: rawEventId },
        data: { processed: true, processedAt: new Date() },
    });
    // Atualizar agregação diária
    await (0, aggregationService_1.updateDailyAggregation)(eventType, {
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
async function handleIncomingWebhook(payload, deliveryId, rawBody) {
    const { id: rawEventId, alreadyExists } = await storeRawEvent(payload, deliveryId, rawBody);
    if (alreadyExists) {
        return { success: true, alreadyExists: true, rawEventId };
    }
    try {
        await processEvent(rawEventId, payload);
    }
    catch (err) {
        console.error(`[EventCollector] ❌ Erro ao processar evento ${rawEventId}:`, err);
        // Registrar erro no rawEvent para reprocessamento futuro
        await prisma_1.prisma.eventRaw.update({
            where: { id: rawEventId },
            data: {
                processError: err instanceof Error ? err.message : String(err),
            },
        }).catch(() => { });
    }
    return { success: true, alreadyExists: false, rawEventId };
}
//# sourceMappingURL=eventCollector.js.map