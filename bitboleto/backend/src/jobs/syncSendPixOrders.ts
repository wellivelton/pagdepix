/**
 * Job em background: Sincroniza ordens Enviar PIX pendentes com a API GeraDePix.
 * Fallback caso o webhook não dispare ou demore.
 * Roda a cada 2 minutos.
 */
import { prisma } from '../prisma';
import { getWithdrawalStatus, refreshWithdrawalReceipt } from '../services/geradepixService';
import { fetchAndStoreSendPixReceipt } from '../services/sendPixReceiptStorage';

const JOB_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
const MAX_ORDERS_PER_RUN = 30;
const MAX_AGE_HOURS = 48; // Só processar ordens das últimas 48h

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

const statusMap: Record<string, string> = {
  completed: 'COMPLETED',
  failed: 'FAILED',
  expired: 'EXPIRED',
  canceled: 'CANCELED',
  refunded: 'REFUNDED',
  pending: 'PENDING',
  processing: 'PENDING',
};

async function runSync(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - MAX_AGE_HOURS);

    const pending = await prisma.sendPixOrder.findMany({
      where: {
        status: 'PENDING',
        geradepixWithdrawalId: { not: null },
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ORDERS_PER_RUN,
    });

    let updated = 0;
    for (const order of pending) {
      if (!order.geradepixWithdrawalId) continue;
      try {
        const result = await getWithdrawalStatus(order.geradepixWithdrawalId);
        if (!result.success || !result.withdrawal) continue;

        const w = result.withdrawal as { status?: string; receipt_url?: string; receiptUrl?: string; error_message?: string };
        const newStatus = statusMap[w.status?.toLowerCase() || ''] || order.status;
        const receiptUrl = w?.receipt_url ?? w?.receiptUrl;

        if (newStatus !== 'PENDING') {
          await prisma.sendPixOrder.update({
            where: { id: order.id },
            data: {
              status: newStatus,
              completedAt: new Date(),
              receiptUrl: receiptUrl || undefined,
              statusDetail:
                newStatus === 'COMPLETED' ? undefined : w?.error_message || w.status,
            },
          });
          updated++;
          if (newStatus === 'COMPLETED' && receiptUrl) {
            fetchAndStoreSendPixReceipt(order.id, receiptUrl).catch((err) =>
              console.warn(`[syncSendPixOrders] Falha ao armazenar comprovante da ordem ${order.id}:`, (err as Error)?.message)
            );
          }
          console.log(
            `[syncSendPixOrders] ✅ Ordem ${order.id.slice(0, 8)}... -> ${newStatus}`
          );
        }
      } catch (err: any) {
        if (!err?.message?.includes('GERADEPIX_API_KEY')) {
          console.warn(`[syncSendPixOrders] Erro ao consultar ordem ${order.id}:`, err?.message);
        }
      }
    }

    // Segunda passada: ordens COMPLETED sem receiptUrl (comprovante pode chegar após o webhook)
    const completedWithoutReceipt = await prisma.sendPixOrder.findMany({
      where: {
        status: 'COMPLETED',
        receiptUrl: null,
        geradepixWithdrawalId: { not: null },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      take: 10,
      select: { id: true, geradepixWithdrawalId: true },
    });

    for (const order of completedWithoutReceipt) {
      if (!order.geradepixWithdrawalId) continue;
      try {
        const refresh = await refreshWithdrawalReceipt(order.geradepixWithdrawalId);
        const wr = refresh.withdrawal as { receipt_url?: string; receiptUrl?: string } | undefined;
        let receiptUrl = wr?.receipt_url ?? wr?.receiptUrl;
        if (!receiptUrl) {
          const result = await getWithdrawalStatus(order.geradepixWithdrawalId);
          const w = result.withdrawal as { receipt_url?: string; receiptUrl?: string } | undefined;
          receiptUrl = w?.receipt_url ?? w?.receiptUrl;
        }
        if (receiptUrl) {
          await prisma.sendPixOrder.update({
            where: { id: order.id },
            data: { receiptUrl },
          });
          fetchAndStoreSendPixReceipt(order.id, receiptUrl).catch((err) =>
            console.warn(`[syncSendPixOrders] Falha ao armazenar comprovante da ordem ${order.id}:`, (err as Error)?.message)
          );
          updated++;
        }
      } catch {
        // Ignora falha por ordem
      }
    }

    if (updated > 0) {
      console.log(`[syncSendPixOrders] Atualizadas ${updated} ordem(ns)`);
    }
  } catch (err: any) {
    console.error('[syncSendPixOrders] Erro:', err?.message);
  } finally {
    isRunning = false;
  }
}

export function startSyncSendPixOrders(): void {
  if (!process.env.GERADEPIX_API_KEY?.trim()) {
    console.log('[syncSendPixOrders] GERADEPIX_API_KEY não configurada, job desativado');
    return;
  }
  runSync();
  intervalId = setInterval(runSync, JOB_INTERVAL_MS);
  console.log(`[syncSendPixOrders] Job iniciado (intervalo: ${JOB_INTERVAL_MS / 1000}s)`);
}
