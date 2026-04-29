import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { fetchAndStoreSendPixReceipt } from '../services/sendPixReceiptStorage';

/**
 * Webhook receptor da API GeraDePix (@geradepixbot).
 * Documentação: https://telegra.ph/DOCUMENTA%C3%87%C3%83O-API-geradepixbot-03-02
 *
 * Eventos recebidos:
 * - payment.paid, payment.expired, payment.canceled, payment.refunded
 * - withdrawal.completed, withdrawal.failed, withdrawal.expired, withdrawal.canceled, withdrawal.refunded
 *
 * Importante: retornar HTTP 200 em menos de 5 segundos.
 */
export const geradepixWebhook = async (req: Request, res: Response) => {
  // Sempre responder 200 imediatamente (doc GeraDePix exige < 5s)
  res.status(200).json({ received: true });

  try {
    const body = req.body as Record<string, unknown>;

    if (!body || typeof body.event !== 'string') {
      console.warn('[GeraDePix] Webhook sem evento válido:', body);
      return;
    }

    const event = body.event as string;

    // Processar de forma assíncrona
    setImmediate(() => handleGeradepixEvent(event, body));
  } catch (err) {
    console.error('[geradepixWebhook] Erro ao processar:', err);
  }
};

async function handleGeradepixEvent(event: string, payload: Record<string, unknown>) {
  try {
    console.log(`[GeraDePix] Evento recebido: ${event}`, JSON.stringify(payload));

    // Eventos de pagamento (receber Pix)
    if (event.startsWith('payment.')) {
      await handlePaymentEvent(event, payload);
      return;
    }

    // Eventos de saque (Depix → Pix)
    if (event.startsWith('withdrawal.')) {
      await handleWithdrawalEvent(event, payload);
      return;
    }
  } catch (err) {
    console.error(`[GeraDePix] Erro ao processar evento ${event}:`, err);
  }
}

async function handlePaymentEvent(
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const paymentId = payload.payment_id as string | undefined;
  const reference = payload.reference as string | undefined;

  switch (event) {
    case 'payment.paid':
      console.log(`[GeraDePix] Pagamento confirmado: ${paymentId} | ref: ${reference}`);
      // Aqui você pode atualizar pedidos internos se usar reference
      break;
    case 'payment.expired':
      console.log(`[GeraDePix] Pagamento expirado: ${paymentId}`);
      break;
    case 'payment.canceled':
      console.log(`[GeraDePix] Pagamento cancelado: ${paymentId}`);
      break;
    case 'payment.refunded':
      console.log(`[GeraDePix] Pagamento reembolsado: ${paymentId}`);
      break;
    default:
      console.log(`[GeraDePix] Evento de pagamento não tratado: ${event}`);
  }
}

async function handleWithdrawalEvent(
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const withdrawalId = payload.withdrawal_id as string | undefined;
  const reference = payload.reference as string | undefined;
  const receiptUrl = (payload.receipt_url ?? payload.receiptUrl) as string | undefined;
  const completedAt = payload.completed_at as string | undefined;
  const errorMessage = (payload.error_message ?? payload.error ?? payload.message) as string | undefined;

  const updateSendPixOrder = async (
    orderId: string,
    status: string,
    extra?: { statusDetail?: string; receiptUrl?: string }
  ) => {
    const sendPix = await prisma.sendPixOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (sendPix && sendPix.status === 'PENDING') {
      await prisma.sendPixOrder.update({
        where: { id: orderId },
        data: {
          status,
          completedAt: new Date(),
          ...(extra?.statusDetail && { statusDetail: extra.statusDetail }),
          ...(extra?.receiptUrl && { receiptUrl: extra.receiptUrl }),
        },
      });
      console.log(`[GeraDePix] SendPixOrder ${orderId} marcado como ${status}`);
      return true;
    }
    return false;
  };

  switch (event) {
    case 'withdrawal.completed': {
      console.log(
        `[GeraDePix] Saque concluído: ${withdrawalId} | ref: ${reference} | comprovante: ${receiptUrl}`
      );

      if (!reference) break;

      // SendPixOrder (Enviar Pix - qualquer usuário)
      const updated = await updateSendPixOrder(reference, 'COMPLETED', {
        receiptUrl: receiptUrl || undefined,
      });
      if (updated && receiptUrl) {
        fetchAndStoreSendPixReceipt(reference, receiptUrl).catch((err) =>
          console.warn('[GeraDePix] Falha ao armazenar comprovante localmente:', (err as Error)?.message)
        );
      }

      if (!updated) {
        // Withdrawal de afiliado
        const w = await prisma.withdrawal.findUnique({
          where: { id: reference },
          select: { id: true, status: true, adminNotes: true },
        });
        if (w !== null && w.status === 'APPROVED') {
          const updateData: { status: string; processedAt: Date; adminNotes?: string } = {
            status: 'PAID',
            processedAt: new Date(completedAt ?? Date.now()),
          };
          if (receiptUrl) {
            updateData.adminNotes = `${w.adminNotes || ''}\nComprovante GeraDePix: ${receiptUrl}`.trim();
          }
          await prisma.withdrawal.update({
            where: { id: reference },
            data: updateData,
          });
          await prisma.geradepixWithdrawal.updateMany({
            where: { withdrawalId: reference },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
          console.log(`[GeraDePix] Withdrawal ${reference} marcado como PAID`);
        }
      }
      break;
    }
    case 'withdrawal.failed': {
      console.log(`[GeraDePix] Saque falhou: ${withdrawalId} | ref: ${reference}`);
      if (reference) {
        await updateSendPixOrder(reference, 'FAILED', {
          statusDetail: errorMessage || 'Falha no processamento pela GeraDePix',
        });
      }
      break;
    }
    case 'withdrawal.expired': {
      console.log(`[GeraDePix] Saque expirado: ${withdrawalId} | ref: ${reference}`);
      if (reference) {
        await updateSendPixOrder(reference, 'EXPIRED', {
          statusDetail: 'Ordem expirada. O prazo para envio do Depix foi ultrapassado.',
        });
      }
      break;
    }
    case 'withdrawal.canceled': {
      console.log(`[GeraDePix] Saque cancelado: ${withdrawalId}`);
      if (reference) {
        await updateSendPixOrder(reference, 'CANCELED', {
          statusDetail: errorMessage || 'Saque cancelado pela GeraDePix',
        });
      }
      break;
    }
    case 'withdrawal.refunded': {
      console.log(`[GeraDePix] Saque reembolsado: ${withdrawalId}`);
      if (reference) {
        await updateSendPixOrder(reference, 'REFUNDED', {
          statusDetail: errorMessage || 'Depix foi reembolsado',
        });
      }
      break;
    }
    default:
      console.log(`[GeraDePix] Evento de saque não tratado: ${event}`);
  }
}
