/**
 * Controller do webhook do Telegram (@PagDepixBot).
 * Recebe updates do Telegram, valida código/username e responde com mensagem de sucesso ou erro genérica.
 */

import { Request, Response } from 'express';
import {
  processWebhookUpdate,
  sendTelegramMessage,
  type TelegramUpdate,
} from '../services/telegram.service';
import { ensureIdempotent, updateResult } from '../services/webhookIdempotency.service';

/** Mensagem quando comando /start é processado com sucesso. */
const MSG_START_SUCCESS = (name: string) => 
  `✅ Olá, ${name}!\n\n` +
  `Seu Telegram foi vinculado com sucesso ao PagDepix.\n\n` +
  `Agora você pode solicitar códigos de verificação diretamente aqui. Volte ao site e clique em "Solicitar Código".`;

/** Mensagem quando não encontra usuário. */
const MSG_USER_NOT_FOUND = (username: string) =>
  `❌ Não encontramos nenhuma conta cadastrada com o Telegram ${username}.\n\n` +
  `Se você já possui uma conta no PagDepix, verifique se o @ está correto ou atualize seu Telegram no site.`;

/** Mensagem quando usuário não tem username. */
const MSG_NO_USERNAME = '❌ Você precisa ter um @username configurado no Telegram para usar o PagDepix.';

/** Mensagem padrão para outras mensagens. */
const MSG_DEFAULT = 
  `👋 Olá! Eu sou o bot do PagDepix.\n\n` +
  `Para vincular sua conta, envie o comando /start\n\n` +
  `Depois, volte ao site para solicitar seu código de verificação.`;

/**
 * Valida que a requisição veio do Telegram (secret token configurado no setWebhook).
 * Se TELEGRAM_WEBHOOK_SECRET estiver definido, exige header X-Telegram-Bot-Api-Secret-Token.
 */
function validateTelegramWebhook(req: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  const token = req.headers['x-telegram-bot-api-secret-token'];
  return typeof token === 'string' && token === secret;
}

/**
 * POST /api/webhook/telegram
 * Recebe updates do Telegram (configurado na URL do bot).
 * Responde sempre 200 para o Telegram; envia resposta ao usuário via bot.
 */
export async function telegramWebhook(req: Request, res: Response): Promise<void> {
  if (!validateTelegramWebhook(req)) {
    res.sendStatus(403);
    return;
  }

  const update = req.body as TelegramUpdate;
  // Telegram exige resposta 200 rápida; processar webhook em background
  res.sendStatus(200);

  // update_id must be present for idempotency tracking.
  if (!update?.update_id) return;

  const externalId = String(update.update_id);

  // Fire-and-forget after response is sent — errors must NOT reach Express error handler.
  void (async () => {
    try {
      const idResult = await ensureIdempotent({
        source: 'telegram',
        eventType: 'telegram.update',
        externalId,
        payload: update,
      });
      if (idResult.alreadyProcessed) {
        console.log(`[Telegram] Duplicate update_id ${externalId} — skipping`);
        return;
      }

      if (!update?.message?.text) {
        await updateResult({ source: 'telegram', eventType: 'telegram.update', externalId, result: 'ok' });
        return;
      }

      const result = await processWebhookUpdate(update);
      if (result.chatId !== 0) {
        const textToSend = result.message || MSG_DEFAULT;
        const opts = result.message ? { parse_mode: 'Markdown' as const } : undefined;
        await sendTelegramMessage(result.chatId, textToSend, opts);
      }
      await updateResult({ source: 'telegram', eventType: 'telegram.update', externalId, result: 'ok' });
    } catch (err) {
      console.error('[Telegram Webhook] Erro:', err);
      await updateResult({
        source: 'telegram',
        eventType: 'telegram.update',
        externalId,
        result: 'error',
        errorMessage: (err as Error)?.message,
      }).catch(() => {});
    }
  })();
}
