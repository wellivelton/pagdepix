import { prisma } from '../prisma';
import { dispatchWebhook } from './webhookService';

/**
 * Para transações sandbox, auto-aprova o pagamento quando o TXID é submetido,
 * simulando o fluxo completo sem necessidade de aprovação manual do admin.
 */
export async function autoApproveSandboxBoleto(boletoId: string): Promise<void> {
  const boleto = await prisma.boleto.findUnique({ where: { id: boletoId } });
  if (!boleto || !boleto.isSandbox || boleto.status !== 'PENDING' || !boleto.txid) return;

  await prisma.boleto.update({
    where: { id: boletoId },
    data: {
      status: 'PAID',
      confirmedAt: new Date(),
    },
  });

  console.log(`[Sandbox] Auto-approved boleto ${boletoId}`);

  if (boleto.apiKeyId) {
    dispatchWebhook('payment.approved', boletoId, 'boleto', {
      amount: boleto.amount,
      fee: boleto.fee,
      totalAmount: boleto.totalAmount,
      status: 'PAID',
      confirmedAt: new Date().toISOString(),
      externalRef: boleto.externalRef,
      sandbox: true,
    }, boleto.apiKeyId, true).catch(() => {});
  }
}

export async function autoApproveSandboxRecharge(rechargeId: string): Promise<void> {
  const recharge = await prisma.mobileRecharge.findUnique({ where: { id: rechargeId } });
  if (!recharge || !recharge.isSandbox || recharge.status !== 'PENDING' || !recharge.txid) return;

  await prisma.mobileRecharge.update({
    where: { id: rechargeId },
    data: {
      status: 'PAID',
      paidAt: new Date(),
    },
  });

  console.log(`[Sandbox] Auto-approved recharge ${rechargeId}`);

  if (recharge.apiKeyId) {
    dispatchWebhook('recharge.completed', rechargeId, 'recharge', {
      operator: recharge.operator,
      phoneNumber: recharge.phoneNumber,
      amount: recharge.amount,
      totalAmount: recharge.totalAmount,
      status: 'PAID',
      externalRef: recharge.externalRef,
      sandbox: true,
    }, recharge.apiKeyId, true).catch(() => {});
  }
}

export async function autoApproveSandboxPixCopiaCola(pixId: string): Promise<void> {
  const record = await (prisma as any).pixCopiaCola.findUnique({ where: { id: pixId } });
  if (!record || !record.isSandbox || record.status !== 'TXID_SUBMITTED') return;

  await (prisma as any).pixCopiaCola.update({
    where: { id: pixId },
    data: { status: 'APPROVED', processedAt: new Date() },
  });

  console.log(`[Sandbox] Auto-approved pix-copia-cola ${pixId}`);

  if (record.apiKeyId) {
    dispatchWebhook('pix.approved', pixId, 'pix-copia-cola', {
      valorOriginal: record.valorOriginal,
      valorTaxa: record.valorTaxa,
      totalFinal: record.totalFinal,
      nomeDestinatario: record.nomeDestinatario,
      paymentCurrency: record.paymentCurrency,
      txid: record.txid,
      status: 'APPROVED',
      externalRef: record.externalRef,
      sandbox: true,
    }, record.apiKeyId, true).catch(() => {});
  }
}
