import { prisma } from '../prisma';
import { notifyAdmin } from './telegram.service';

const isValidTxid = (txid: string) => /^[a-fA-F0-9]{64}$/.test(txid);

const checkAntiReplay = async (txid: string): Promise<boolean> => {
  const [b, r, bt] = await Promise.all([
    prisma.boleto.findFirst({ where: { txid } }),
    prisma.mobileRecharge.findFirst({ where: { txid } }),
    (prisma as any).boletoBatch.findFirst({ where: { txid } }),
  ]);
  return b !== null || r !== null || bt !== null;
};

export const updateBatchTxid = async (input: {
  batchId: string;
  userId: string;
  txid: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ success: boolean; error?: string }> => {
  const { batchId, userId, txid, ip, userAgent } = input;

  if (!txid?.trim()) return { success: false, error: 'TXID é obrigatório.' };
  const txidCleaned = txid.trim();
  if (!isValidTxid(txidCleaned)) return { success: false, error: 'TXID inválido. Deve ter 64 caracteres hexadecimais.' };

  // Buscar batch
  const batch = await (prisma as any).boletoBatch.findFirst({
    where: { id: batchId, userId },
    include: {
      user: { select: { id: true, name: true, email: true, telegram: true, isBlocked: true, isActive: true } },
      boletos: { select: { id: true, barcode: true, amount: true, fee: true, totalAmount: true, dueDate: true } },
    },
  });

  if (!batch) return { success: false, error: 'Lote não encontrado ou sem permissão.' };
  if (batch.status === 'PAID') return { success: false, error: 'Este lote já foi pago.' };
  if (batch.status === 'CANCELLED') return { success: false, error: 'Este lote está cancelado.' };
  if (batch.txid) return { success: false, error: 'Este lote já possui TXID registrado.' };
  if (batch.user.isBlocked) return { success: false, error: 'Usuário bloqueado.' };
  if (!batch.user.isActive) return { success: false, error: 'Usuário inativo.' };

  // Rate lock
  if (batch.rateLockExpiresAt && new Date() > new Date(batch.rateLockExpiresAt)) {
    return { success: false, error: 'Cotação expirada. Crie um novo pagamento.' };
  }

  // Anti-replay
  if (await checkAntiReplay(txidCleaned)) {
    return { success: false, error: 'Este TXID já foi utilizado em outra transação.' };
  }

  // Atualizar batch
  await (prisma as any).boletoBatch.update({
    where: { id: batchId },
    data: { txid: txidCleaned, paidAt: new Date() },
  });

  // Log
  await prisma.log.create({
    data: {
      action: 'boleto_batch_txid_submitted',
      details: JSON.stringify({ batchId, txid: txidCleaned, grandTotal: batch.grandTotal, itemCount: batch.itemCount }),
      ip: ip || 'unknown',
      userAgent: userAgent || 'unknown',
      userId,
    },
  });

  // ── Notificação Telegram (batch) ─────────────────────────────────────────

  const userLabel = batch.user.email || batch.user.name || 'Cliente';
  const curr = batch.paymentCurrency || 'DEPIX';

  const cryptoLine = batch.cryptoAmount && curr !== 'DEPIX'
    ? `\nCrypto: ${curr === 'USDT' ? batch.cryptoAmount + ' USDT' : Number(batch.cryptoAmount).toLocaleString('pt-BR') + ' sats'}`
    : '';

  const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const fmtDate = (d: any) => new Date(d).toLocaleDateString('pt-BR');

  const itemLines = batch.boletos
    .map((b: any, i: number) =>
      `  ${i + 1}. Valor: ${fmtBRL(b.amount)} | Taxa: ${fmtBRL(b.fee)} | Venc: ${fmtDate(b.dueDate)}\n` +
      `     Código: ${b.barcode ? b.barcode : 'PDF'}`,
    )
    .join('\n');

  const msg =
    `📦 LOTE de boletos no PagDepix (TXID registrado)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 Usuário: ${userLabel}\n` +
    `🔢 Boletos: ${batch.itemCount}\n` +
    `💰 Total: ${fmtBRL(batch.grandTotal)} (taxas: ${fmtBRL(batch.totalFee)})\n` +
    `💎 Moeda: ${curr}${cryptoLine}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 Detalhes dos boletos:\n${itemLines}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔑 Lote ID: ${batchId}\n` +
    `🔗 TXID: ${txidCleaned}`;

  notifyAdmin(msg).catch(() => {});

  console.log(`[BATCH TXID] Lote ${batchId} | Usuário: ${batch.user.name} | Total: ${batch.grandTotal} | Items: ${batch.itemCount} | TXID: ${txidCleaned}`);

  return { success: true };
};
