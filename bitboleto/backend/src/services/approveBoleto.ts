import { prisma } from '../prisma';
import { getAffiliateCommissionFromProfit, REFERRAL_RATE } from '../utils/taxConfig';
import { notifyBoletoApproved, notifyAffiliateCommission } from './push.service';
import { notifyUserByTelegram } from './telegram.service';
import { dispatchWebhook } from './webhookService';

export interface ApproveBoletoOptions {
  receiptUrl?: string;
  paidViaAsaas?: boolean;
  asaasPaymentId?: string;
  adminNotes?: string;
}

export interface ApproveBoletoResult {
  success: boolean;
  error?: string;
  boleto?: any;
}

export async function approveBoletoService(
  boletoId: string,
  options: ApproveBoletoOptions = {}
): Promise<ApproveBoletoResult> {
  const boleto = await prisma.boleto.findUnique({
    where: { id: boletoId },
    include: {
      user: { select: { id: true, name: true, email: true, telegram: true } },
    },
  });
  if (!boleto) return { success: false, error: 'Boleto não encontrado.' };

  let referralNotification: { earnerId: string; commission: number } | null = null;
  let affiliateUserId: string | null = null;
  let affiliateCommission = 0;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Atomic claim — PENDING → PAID
      const claimed = await tx.boleto.updateMany({
        where: { id: boletoId, status: 'PENDING' },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          confirmedAt: new Date(),
          ...(options.receiptUrl != null ? { receiptUrl: options.receiptUrl } : {}),
          ...(options.adminNotes != null ? { adminNotes: options.adminNotes } : {}),
          ...(options.paidViaAsaas ? { paidViaAsaas: true } : {}),
          ...(options.asaasPaymentId != null ? { asaasPaymentId: options.asaasPaymentId } : {}),
        },
      });
      if (claimed.count === 0) throw new Error('BOLETO_ALREADY_PROCESSED');

      // 2. user.totalPaid
      await tx.user.update({
        where: { id: boleto.userId },
        data: { totalPaid: { increment: Number(boleto.totalAmount) } },
      });

      // 3. Referral — no silent catch, errors propagate; user.balance incremented inline (Q4)
      const owner = await tx.user.findUnique({
        where: { id: boleto.userId },
        select: { referredByCode: true },
      });
      if (owner?.referredByCode) {
        const referrer = await tx.user.findUnique({
          where: { referralCode: owner.referredByCode },
          select: { id: true },
        });
        if (referrer) {
          const referralCommission = Math.floor(Number(boleto.fee) * REFERRAL_RATE * 100) / 100;
          if (referralCommission > 0) {
            await tx.referralEarning.create({
              data: {
                earnerId: referrer.id,
                sourceUserId: boleto.userId,
                boletoId: boleto.id,
                feeAmount: Number(boleto.fee),
                commission: referralCommission,
              },
            });
            await tx.user.update({
              where: { id: referrer.id },
              data: { referralBalance: { increment: referralCommission } },
            });
            referralNotification = { earnerId: referrer.id, commission: referralCommission };
          }
        }
      }

      // 4. Affiliate — no silent catch, errors propagate
      if (boleto.affiliateId) {
        const existingAffTx = await tx.affiliateTransaction.findFirst({
          where: { affiliateId: boleto.affiliateId, boletoId: boleto.id },
        });
        if (existingAffTx) {
          if (existingAffTx.status === 'PENDING') {
            await tx.affiliateTransaction.update({
              where: { id: existingAffTx.id },
              data: { status: 'AVAILABLE', availableAt: new Date() },
            });
            await tx.affiliate.update({
              where: { id: boleto.affiliateId },
              data: {
                pendingBalance: { decrement: existingAffTx.commission },
                balance: { increment: existingAffTx.commission },
              },
            });
            affiliateCommission = Number(existingAffTx.commission);
          }
        } else {
          const commission = getAffiliateCommissionFromProfit(
            Number(boleto.fee),
            Number(boleto.amount)
          );
          if (commission > 0) {
            await tx.affiliateTransaction.create({
              data: {
                affiliateId: boleto.affiliateId,
                boletoId: boleto.id,
                amount: Number(boleto.totalAmount),
                commission,
                status: 'AVAILABLE',
                availableAt: new Date(),
              },
            });
            await tx.affiliate.update({
              where: { id: boleto.affiliateId },
              data: {
                balance: { increment: commission },
                totalEarned: { increment: commission },
              },
            });
            affiliateCommission = commission;
          }
        }
        const aff = await tx.affiliate.findUnique({
          where: { id: boleto.affiliateId },
          select: { userId: true },
        });
        if (aff) affiliateUserId = aff.userId;
      }

      // 5. Coupon usageCount — Bug B fix: outside if(affiliateId)
      if (boleto.couponId) {
        await tx.coupon.update({
          where: { id: boleto.couponId },
          data: { usageCount: { increment: 1 } },
        });
      }
    }, { isolationLevel: 'Serializable', timeout: 10000 });
  } catch (err: any) {
    if (err?.message === 'BOLETO_ALREADY_PROCESSED') {
      console.warn(`[approveBoleto] Boleto ${boletoId} already processed.`);
      return { success: false, error: 'Boleto já foi processado.' };
    }
    throw err;
  }

  const updated = await prisma.boleto.findUnique({ where: { id: boletoId } });

  // Post-tx notifications (outside transaction per pattern)
  const notif = referralNotification as { earnerId: string; commission: number } | null;
  if (notif) {
    notifyAffiliateCommission(notif.earnerId, notif.commission).catch(() => {});
    notifyUserByTelegram(
      notif.earnerId,
      `🎉 Nova comissão de indicação!\n\nVocê ganhou R$ ${notif.commission.toFixed(2)} pela aprovação de um boleto do seu indicado.`
    ).catch(() => {});
  }
  if (affiliateUserId && affiliateCommission > 0) {
    notifyAffiliateCommission(affiliateUserId, affiliateCommission).catch(() => {});
  }

  const valor = Number(boleto.totalAmount).toFixed(2).replace('.', ',');
  notifyUserByTelegram(
    boleto.userId,
    `✅ PagDepix liquidou seu boleto!\nValor: R$ ${valor}\nAcesse o site para ver o comprovante.`
  ).catch(() => {});
  notifyBoletoApproved(boleto.userId, Number(boleto.totalAmount), updated?.receiptUrl ?? null).catch(() => {});

  if ((boleto as any).apiKeyId) {
    dispatchWebhook(
      'payment.approved',
      boleto.id,
      'boleto',
      {
        amount: boleto.amount,
        fee: boleto.fee,
        totalAmount: boleto.totalAmount,
        status: 'PAID',
        confirmedAt: updated?.confirmedAt,
        receiptUrl: updated?.receiptUrl,
        externalRef: (boleto as any).externalRef,
      },
      (boleto as any).apiKeyId,
      (boleto as any).isSandbox
    ).catch(() => {});
  }

  // Sync batch status: if all boletos in the batch are PAID, mark batch as PAID too
  const batchId = (boleto as any).batchId as string | null;
  if (batchId) {
    try {
      const remaining = await prisma.boleto.count({
        where: { batchId, status: { not: 'PAID' } },
      });
      if (remaining === 0) {
        await (prisma as any).boletoBatch.update({
          where: { id: batchId },
          data: { status: 'PAID', confirmedAt: new Date() },
        });
      }
    } catch (err) {
      console.error('[approveBoleto] Failed to sync batch status:', err);
    }
  }

  return { success: true, boleto: updated };
}
