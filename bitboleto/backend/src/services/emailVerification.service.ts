/**
 * Serviço de verificação de email por código (cadastro)
 * - Código 6 dígitos
 * - Expira em 5 minutos
 * - Máximo 3 tentativas
 */

import * as crypto from 'crypto';
import { prisma } from '../prisma';
import { sendVerificationCodeEmail } from './email.service';
import { validateEmail } from '../utils/validation/emailValidation';

const CODE_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 3;

function generateCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function getExpiry(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + CODE_EXPIRY_MINUTES);
  return d;
}

export interface SendCodeResult {
  success: boolean;
  error?: string;
}

/**
 * Envia código de verificação para o email.
 * Valida o email antes de enviar.
 */
export async function sendVerificationCode(email: string): Promise<SendCodeResult> {
  const validation = validateEmail(email);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Verificar se email já está cadastrado
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    return { success: false, error: 'Este e-mail já está cadastrado' };
  }

  const code = generateCode();
  const expiresAt = getExpiry();

  // Upsert: cria ou atualiza (permite reenvio)
  await prisma.emailVerificationRequest.upsert({
    where: { email: normalizedEmail },
    create: {
      email: normalizedEmail,
      code,
      attempts: 0,
      expiresAt,
    },
    update: {
      code,
      attempts: 0,
      expiresAt,
      verifiedAt: null,
    },
  });

  await sendVerificationCodeEmail(normalizedEmail, code, CODE_EXPIRY_MINUTES);

  return { success: true };
}

export interface VerifyCodeResult {
  success: boolean;
  error?: string;
}

/**
 * Verifica o código digitado pelo usuário.
 * Máximo 3 tentativas.
 */
export async function verifyEmailCode(email: string, code: string): Promise<VerifyCodeResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const codeDigits = String(code || '').replace(/\D/g, '').slice(0, 6);

  if (codeDigits.length !== 6) {
    return { success: false, error: 'Código deve ter 6 dígitos' };
  }

  const record = await prisma.emailVerificationRequest.findFirst({
    where: { email: normalizedEmail },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    return { success: false, error: 'Solicite um novo código de verificação' };
  }

  if (record.verifiedAt) {
    return { success: true };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return {
      success: false,
      error: 'Máximo de tentativas excedido. Solicite um novo código.',
    };
  }

  if (new Date() > record.expiresAt) {
    return {
      success: false,
      error: 'Código expirado. Solicite um novo código.',
    };
  }

  if (record.code !== codeDigits) {
    await prisma.emailVerificationRequest.update({
      where: { id: record.id },
      data: { attempts: record.attempts + 1 },
    });
    const remaining = MAX_ATTEMPTS - record.attempts - 1;
    return {
      success: false,
      error: remaining > 0
        ? `Código incorreto. ${remaining} tentativa(s) restante(s).`
        : 'Máximo de tentativas excedido. Solicite um novo código.',
    };
  }

  await prisma.emailVerificationRequest.update({
    where: { id: record.id },
    data: { verifiedAt: new Date() },
  });

  return { success: true };
}

/**
 * Verifica se o email foi verificado recentemente (últimos 10 min).
 * Usado no register para garantir que o email foi validado.
 */
export async function isEmailRecentlyVerified(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const record = await prisma.emailVerificationRequest.findFirst({
    where: {
      email: normalizedEmail,
      verifiedAt: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record?.verifiedAt) return false;

  const tenMinutesAgo = new Date();
  tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);

  return record.verifiedAt >= tenMinutesAgo;
}
