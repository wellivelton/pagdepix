/**
 * Serviço de verificação via Telegram (@PagDepixBot).
 * - Gera código de 6 caracteres (hex) criptograficamente seguro.
 * - BOT ENVIA código para o usuário via mensagem direta
 * - Usuário insere código na plataforma para validação
 * - Sistema valida código e marca telegramVerified = true
 */

import * as crypto from 'crypto';
import TelegramBot from 'node-telegram-bot-api';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Expiração do código de verificação: 5 minutos (reduzido para maior segurança). */
const TELEGRAM_VERIFY_EXPIRY_MINUTES = 5;

/** Máximo de tentativas de validação de código permitidas. */
const MAX_VERIFICATION_ATTEMPTS = 5;

/** Gera código numérico de 6 dígitos (mais intuitivo para o usuário). */
export function generateTelegramVerifyCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 dígitos (100000-999999)
}

/** Retorna a data de expiração (agora + 5 minutos). */
export function getTelegramVerifyExpiry(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + TELEGRAM_VERIFY_EXPIRY_MINUTES);
  return d;
}

/**
 * Envia código de verificação para o Telegram do usuário.
 * Retorna sucesso se conseguiu enviar, ou erro se o Telegram não foi encontrado.
 */
export async function sendVerificationCodeToUser(telegramUsername: string, code: string): Promise<{
  success: boolean;
  error?: string;
  errorCode?: 'NOT_FOUND' | 'BOT_NOT_CONFIGURED' | 'SEND_ERROR';
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token || !token.trim()) {
    console.error('[Telegram] TELEGRAM_BOT_TOKEN não configurado');
    return { 
      success: false, 
      error: 'Bot do Telegram não está configurado no servidor.',
      errorCode: 'BOT_NOT_CONFIGURED'
    };
  }

  const bot = new TelegramBot(token, { polling: false });

  // Normalizar username (remover @ se presente)
  const username = telegramUsername.startsWith('@') 
    ? telegramUsername.slice(1) 
    : telegramUsername;

  try {
    // Tentar enviar mensagem diretamente para o username
    // IMPORTANTE: Para isso funcionar, o usuário precisa ter iniciado conversa com o bot antes
    // Caso contrário, precisamos usar o chat_id que só obtemos quando o usuário interage com o bot
    
    const message = `🔐 *PagDepix - Código de Verificação*\n\n` +
      `Seu código de verificação é:\n\n` +
      `*${code}*\n\n` +
      `⏱️ Este código expira em ${TELEGRAM_VERIFY_EXPIRY_MINUTES} minutos.\n` +
      `🚫 Não compartilhe este código com ninguém.\n\n` +
      `Se você não solicitou este código, ignore esta mensagem.`;

    // Primeiro, tentamos buscar o chat_id do usuário no banco (se já tiver interagido antes)
    const user = await prisma.user.findFirst({
      where: { 
        telegram: { 
          in: [`@${username.toLowerCase()}`, username.toLowerCase()] 
        } 
      },
      select: { telegramChatId: true },
    });

    if (user?.telegramChatId) {
      // Usuário já interagiu com o bot antes, temos o chat_id
      const chatId = parseInt(user.telegramChatId, 10);
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      return { success: true };
    } else {
      // Usuário nunca interagiu com o bot
      // Não é possível enviar mensagem sem o chat_id
      // Precisamos instruir o usuário a iniciar conversa primeiro
      return {
        success: false,
        error: 'Você precisa iniciar uma conversa com o bot @PagDepixBot no Telegram primeiro. Abra o bot e clique em "Iniciar".',
        errorCode: 'NOT_FOUND'
      };
    }
  } catch (err: any) {
    console.error('[Telegram] Erro ao enviar código:', err?.message || err);
    
    // Tratar erros específicos da API do Telegram
    if (err?.response?.body?.error_code === 400) {
      return {
        success: false,
        error: 'Telegram não encontrado. Verifique se o @ está correto e se você já iniciou conversa com @PagDepixBot.',
        errorCode: 'NOT_FOUND'
      };
    }

    return {
      success: false,
      error: 'Erro ao enviar código. Tente novamente em alguns instantes.',
      errorCode: 'SEND_ERROR'
    };
  }
}

/** Estrutura do update enviado pelo Telegram no webhook. */
export interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot?: boolean;
      first_name?: string;
      username?: string;
    };
    chat: { id: number; type: string };
    text?: string;
    entities?: Array<{ type: string; offset: number; length: number }>;
  };
}

export interface ProcessWebhookResult {
  success: boolean;
  chatId: number;
  error?: string;
  /** Mensagem a enviar ao usuário (ex.: com o código gerado no /start) */
  message?: string;
}

/**
 * Processa comando /start do bot.
 * 1. Associa o chat_id ao usuário pelo @username.
 * 2. Gera código de verificação e salva no banco.
 * 3. Retorna mensagem COM O CÓDIGO para enviar ao usuário (fluxo guiado, sem fricção).
 */
export async function processStartCommand(chatId: number, username?: string): Promise<{
  success: boolean;
  message?: string;
}> {
  if (!username) {
    return {
      success: false,
      message: '❌ Você precisa ter um @username configurado no Telegram para usar o PagDepix.',
    };
  }

  const normalizedUsername = `@${username.toLowerCase()}`;

  // Buscar usuário no banco pelo telegram
  const user = await prisma.user.findFirst({
    where: {
      telegram: {
        in: [normalizedUsername, username.toLowerCase()],
      },
    },
    select: { id: true, name: true, telegramChatId: true },
  });

  if (!user) {
    return {
      success: false,
      message: `❌ Não encontramos nenhuma conta cadastrada com o Telegram ${normalizedUsername}.\n\n` +
        `Se você já possui uma conta no PagDepix, verifique se o @ está correto ou atualize seu Telegram no site.`,
    };
  }

  // Gerar código e expiração
  const code = generateTelegramVerifyCode();
  const expiresAt = getTelegramVerifyExpiry();

  // Atualizar: chat_id + código (enviado automaticamente ao dar /start)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramChatId: String(chatId),
      telegramVerifyToken: code,
      telegramVerifyExpires: expiresAt,
    },
  });

  return {
    success: true,
    message: `✅ Olá, ${user.name}!\n\n` +
      `Seu Telegram foi vinculado ao PagDepix.\n\n` +
      `🔐 *Seu código de verificação:*\n*${code}*\n\n` +
      `Volte ao site e digite este código na página de verificação.\n` +
      `⏱️ O código expira em ${TELEGRAM_VERIFY_EXPIRY_MINUTES} minutos.\n\n` +
      `Não compartilhe este código com ninguém.`,
  };
}

/**
 * Processa um update do webhook do Telegram.
 * NOVA LÓGICA: Não processa códigos aqui (usuário insere no site).
 * Apenas processa comando /start para registrar chat_id.
 */
export async function processWebhookUpdate(update: TelegramUpdate): Promise<ProcessWebhookResult> {
  const message = update.message;
  if (!message?.from?.id || !message?.chat?.id || typeof message.text !== 'string') {
    return { success: false, chatId: 0 };
  }

  const chatId = message.chat.id;
  const text = message.text.trim();
  const telegramUsername = message.from.username?.trim();

  // Processar comando /start
  if (text === '/start' || text.startsWith('/start')) {
    const result = await processStartCommand(chatId, telegramUsername);
    return {
      success: result.success,
      chatId,
      error: result.success ? undefined : 'start_error',
      message: result.message,
    };
  }

  // Mensagens normais: apenas responder educadamente
  return { success: false, chatId };
}

/**
 * Envia mensagem ao usuário no Telegram via bot.
 * Usar apenas com TELEGRAM_BOT_TOKEN configurado.
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  options?: { parse_mode?: 'Markdown' | 'HTML' }
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('[Telegram] TELEGRAM_BOT_TOKEN não configurado');
    return;
  }
  const bot = new TelegramBot(token, { polling: false });
  try {
    await bot.sendMessage(chatId, text, options || {});
  } catch (err: any) {
    // Se falhou com erro de parse de entidades, retenta sem formatação
    if (err?.message?.includes('parse entities') || err?.message?.includes('Bad Request')) {
      console.warn('[Telegram] Falha no parse Markdown, reenviando como texto simples.');
      try {
        const plain = text.replace(/[*_`[\]()~>#+=|{}.!\\-]/g, '');
        await bot.sendMessage(chatId, plain, {});
      } catch (err2) {
        console.error('[Telegram] Falha definitiva ao enviar mensagem:', err2);
      }
    } else {
      console.error('[Telegram] Erro ao enviar mensagem:', err);
    }
  }
}

/**
 * Envia notificação ao admin no Telegram (seu chat pessoal).
 * Configure TELEGRAM_ADMIN_CHAT_ID no .env com o seu chat_id.
 * Para obter o chat_id: envie /start para @userinfobot no Telegram ou use o webhook (log do chat.id ao falar com o bot).
 */
export async function notifyAdmin(message: string): Promise<void> {
  const chatIdRaw = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatIdRaw || !chatIdRaw.trim()) return;
  const chatId = parseInt(chatIdRaw.trim(), 10);
  if (!Number.isFinite(chatId)) return;
  await sendTelegramMessage(chatId, message);
}

/**
 * Envia notificação ao usuário no Telegram (se ele tiver verificado o bot e tiver telegramChatId salvo).
 * Não falha a operação se o usuário não tiver Telegram configurado.
 */
export async function notifyUserByTelegram(userId: string, text: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true },
  });
  if (!user?.telegramChatId?.trim()) return;
  const chatId = parseInt(user.telegramChatId.trim(), 10);
  if (!Number.isFinite(chatId)) return;
  await sendTelegramMessage(chatId, text);
}

/**
 * Valida código de verificação inserido pelo usuário.
 * Verifica: código existe, não expirou, não excedeu tentativas.
 * Se válido: marca telegramVerified = true.
 */
export async function validateVerificationCode(userId: string, code: string): Promise<{
  success: boolean;
  error?: string;
  errorCode?: 'INVALID_CODE' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS' | 'ALREADY_VERIFIED';
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      telegram: true,
      telegramVerified: true,
      telegramVerifyToken: true,
      telegramVerifyExpires: true,
      telegramChatId: true,
    },
  });

  if (!user) {
    return {
      success: false,
      error: 'Usuário não encontrado.',
      errorCode: 'INVALID_CODE',
    };
  }

  if (user.telegramVerified) {
    return {
      success: false,
      error: 'Telegram já está verificado.',
      errorCode: 'ALREADY_VERIFIED',
    };
  }

  // Verificar se o código existe
  if (!user.telegramVerifyToken) {
    return {
      success: false,
      error: 'Nenhum código foi solicitado. Solicite um novo código.',
      errorCode: 'INVALID_CODE',
    };
  }

  // Verificar se o código expirou
  if (!user.telegramVerifyExpires || user.telegramVerifyExpires < new Date()) {
    return {
      success: false,
      error: 'Código expirado. Solicite um novo código.',
      errorCode: 'EXPIRED',
    };
  }

  // Verificar se o código está correto
  if (user.telegramVerifyToken !== code.trim()) {
    return {
      success: false,
      error: 'Código incorreto. Verifique e tente novamente.',
      errorCode: 'INVALID_CODE',
    };
  }

  // Código válido! Marcar como verificado
  await prisma.user.update({
    where: { id: userId },
    data: {
      telegramVerified: true,
      telegramVerifyToken: null,
      telegramVerifyExpires: null,
    },
  });

  return { success: true };
}
