import { prisma } from '../prisma';
import { asaasIsConfigured, asaasGetRechargeStatus } from '../services/asaas.service';
import { finalizeApprovedRecharge } from '../services/mobileRecharge';
import { notifyAdmin } from '../services/telegram.service';

const JOB_INTERVAL_MS = 30_000;

async function checkProcessingRecharges() {
  if (!asaasIsConfigured()) return;

  const recharges = await (prisma as any).mobileRecharge.findMany({
    where: {
      status: 'PROCESSING',
      asaasRechargeId: { not: null },
    },
    select: { id: true, asaasRechargeId: true, phoneNumber: true, amount: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  if (recharges.length === 0) return;

  console.log(`[SyncAsaas] Verificando ${recharges.length} recarga(s) PROCESSING...`);

  for (const recharge of recharges) {
    try {
      const result = await asaasGetRechargeStatus(recharge.asaasRechargeId);
      if (!result.success) {
        console.warn(`[SyncAsaas] Falha ao verificar recarga ${recharge.id}: ${result.error}`);
        continue;
      }

      await (prisma as any).mobileRecharge.update({
        where: { id: recharge.id },
        data: { asaasStatus: result.status },
      });

      if (result.status === 'CONFIRMED') {
        console.log(`[SyncAsaas] Recarga ${recharge.id} CONFIRMADA pelo Asaas. Finalizando...`);
        await finalizeApprovedRecharge(recharge.id, { asaasOperatorName: result.operatorName });
      } else if (result.status === 'CANCELLED' || result.status === 'REFUNDED') {
        console.warn(`[SyncAsaas] Recarga ${recharge.id} ${result.status} pelo Asaas. Revertendo para PENDING.`);
        await (prisma as any).mobileRecharge.update({
          where: { id: recharge.id },
          data: { status: 'PENDING' },
        });
        notifyAdmin(
          `⚠️ *Recarga cancelada/reembolsada pelo Asaas!*\n` +
          `ID: \`${recharge.id}\`\n` +
          `Asaas ID: \`${recharge.asaasRechargeId}\`\n` +
          `Fone: ${recharge.phoneNumber}\n` +
          `Valor: R$ ${recharge.amount.toFixed(2)}\n` +
          `Status Asaas: ${result.status}\n\n` +
          `Recarga voltou para PENDING. Verifique e reprocesse manualmente.`
        ).catch(() => {});
      } else if (result.status === 'WAITING_CRITICAL_ACTION') {
        notifyAdmin(
          `🚨 *Recarga requer ação crítica no Asaas!*\n` +
          `ID: \`${recharge.id}\`\n` +
          `Asaas ID: \`${recharge.asaasRechargeId}\`\n` +
          `Acesse o painel Asaas para resolver.`
        ).catch(() => {});
      }
    } catch (err) {
      console.error(`[SyncAsaas] Erro ao processar recarga ${recharge.id}:`, err);
    }
  }
}

export function startSyncAsaasRecharges() {
  if (!asaasIsConfigured()) {
    console.log('[SyncAsaas] ASAAS_API_KEY não configurada. Job desativado.');
    return;
  }
  console.log('[SyncAsaas] Job iniciado (intervalo: 30s).');
  setInterval(() => {
    checkProcessingRecharges().catch(err => console.error('[SyncAsaas] Erro no job:', err));
  }, JOB_INTERVAL_MS);
}
