import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { sendNotification } from '../services/push.service';
import { sendTelegramMessage } from '../services/telegram.service';

export async function listPendingRefunds(req: Request, res: Response) {
  const swaps = await prisma.sideswapSwap.findMany({
    where: {
      refundAddress: { not: null },
      status: { in: ['failed', 'refunded'] },
    },
    orderBy: { refundRequestAt: 'asc' },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return res.json({ swaps });
}

export async function completeRefund(req: Request, res: Response) {
  const id = req.params.id as string;
  const { txid } = req.body as { txid?: string };

  const swap = await prisma.sideswapSwap.findUnique({ where: { id } });

  if (!swap) return res.status(404).json({ error: 'Swap não encontrado.' });
  if (!swap.refundAddress) return res.status(400).json({ error: 'Sem endereço de reembolso registrado.' });
  if (swap.status === 'refunded') return res.status(400).json({ error: 'Reembolso já processado.' });

  await prisma.sideswapSwap.update({
    where: { id },
    data: {
      status: 'refunded',
      settleTxid: txid?.trim() || swap.settleTxid,
      updatedAt: new Date(),
    },
  });

  const amount = swap.depositAmount ? `${swap.depositAmount} ${swap.depositAsset}` : swap.depositAsset;

  // Notificar usuário via push
  sendNotification(swap.userId, {
    title: '✅ Reembolso processado',
    body: `Seu reembolso de ${amount} foi enviado para o endereço informado.`,
    link: `${process.env.FRONTEND_URL || 'https://pagdepix.com'}/historico`,
    tag: 'swap-refunded',
  }).catch(() => {});

  // Confirmar no Telegram
  const rawChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (rawChatId) {
    const msg = [
      `✅ *Reembolso SideSwap marcado como concluído*`,
      `Swap ID: \`${swap.id}\``,
      `Valor: ${amount}`,
      `Endereço: \`${swap.refundAddress}\``,
      txid ? `TXID: \`${txid.trim()}\`` : '',
    ].filter(Boolean).join('\n');
    sendTelegramMessage(parseInt(rawChatId, 10), msg, { parse_mode: 'Markdown' }).catch(() => {});
  }

  return res.json({ ok: true });
}
