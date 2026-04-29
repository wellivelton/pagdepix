import { prisma } from '../prisma';
import { costForAmount } from './taxConfig';

/** Quando false, verificação de email/telegram está desativada e todos são considerados verificados. */
const ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION = process.env.ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION === 'true';

/**
 * Verifica se o usuário está verificado (email e telegram).
 * Admin é considerado sempre verificado (dono do sistema).
 * Quando verificação está desativada, retorna true.
 */
export async function isUserVerified(userId: string): Promise<boolean> {
  if (!ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, telegramVerified: true, role: true }
  });

  if (!user) return false;
  if (user.role === 'ADMIN') return true; // Admin não precisa verificar
  return user.emailVerified && user.telegramVerified;
}

/**
 * Verifica limites de criação de conta por IP/device
 * Máx. 2 contas por IP por dia
 * Máx. 2 contas por device fingerprint por dia
 */
export async function checkAccountCreationLimits(
  ip: string,
  deviceFingerprint?: string
): Promise<{ allowed: boolean; reason?: string }> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Verificar limite por IP
  const accountsByIp = await prisma.accountCreation.count({
    where: {
      ip,
      createdAt: { gte: hoje }
    }
  });

  if (accountsByIp >= 2) {
    return {
      allowed: false,
      reason: 'Limite de contas por IP excedido (máx. 2 por dia)'
    };
  }

  // Verificar limite por device fingerprint
  if (deviceFingerprint) {
    const accountsByDevice = await prisma.accountCreation.count({
      where: {
        deviceFingerprint,
        createdAt: { gte: hoje }
      }
    });

    if (accountsByDevice >= 2) {
      return {
        allowed: false,
        reason: 'Limite de contas por dispositivo excedido (máx. 2 por dia)'
      };
    }
  }

  return { allowed: true };
}

/**
 * Verifica se o uso do cupom é válido (antifraude)
 * - Afiliado não pode usar próprio cupom
 * - Bloquear se email/telegram/IP/device forem do afiliado
 * - Cupom válido apenas para boletos >= R$ 40
 * - Máx. 2 usos do mesmo cupom por email/telegram por dia
 */
export async function validateCouponUsage(
  couponCode: string,
  userId: string,
  userEmail: string,
  userTelegram: string,
  userIp: string,
  deviceFingerprint: string | undefined,
  boletoAmount: number,
  minAmount: number = 40
): Promise<{ valid: boolean; reason?: string }> {
  // Buscar cupom e afiliado
  const coupon = await prisma.coupon.findUnique({
    where: { code: couponCode.toUpperCase() },
    include: {
      affiliate: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              telegram: true
            }
          }
        }
      }
    }
  });

  if (!coupon) {
    return { valid: false, reason: 'Cupom não encontrado' };
  }

  if (!coupon.isActive) {
    return { valid: false, reason: 'Cupom inativo' };
  }

  // Verificar se é o próprio afiliado tentando usar o cupom
  if (coupon.affiliate && coupon.affiliate.userId === userId) {
    return { valid: false, reason: 'Afiliado não pode usar o próprio cupom' };
  }

  // Verificar se email/telegram/IP/device são do afiliado
  if (coupon.affiliate) {
    const affiliateUser = coupon.affiliate.user;
    
    if (affiliateUser.email.toLowerCase() === userEmail.toLowerCase()) {
      return { valid: false, reason: 'Email do comprador igual ao do afiliado' };
    }

    if (affiliateUser.telegram.toLowerCase() === userTelegram.toLowerCase()) {
      return { valid: false, reason: 'Telegram do comprador igual ao do afiliado' };
    }

    // Verificar IP do afiliado (último login)
    const affiliateLastIp = await prisma.user.findUnique({
      where: { id: affiliateUser.id },
      select: { lastLoginIp: true }
    });

    if (affiliateLastIp?.lastLoginIp === userIp) {
      return { valid: false, reason: 'IP do comprador igual ao do afiliado' };
    }

    // Verificar device fingerprint do afiliado
    if (deviceFingerprint) {
      const affiliateDevice = await prisma.user.findUnique({
        where: { id: affiliateUser.id },
        select: { deviceFingerprint: true }
      });

      if (affiliateDevice?.deviceFingerprint === deviceFingerprint) {
        return { valid: false, reason: 'Device fingerprint do comprador igual ao do afiliado' };
      }
    }
  }

  // Valor mínimo para uso do cupom (boletos R$ 40, recarga R$ 20)
  if (boletoAmount < minAmount) {
    return { valid: false, reason: `Valor mínimo para uso do cupom é R$ ${minAmount.toFixed(2).replace('.', ',')}` };
  }

  // Máx. 2 usos do mesmo cupom por email/telegram por dia
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const usosPorEmail = await prisma.couponUsage.count({
    where: {
      couponId: coupon.id,
      userEmail: userEmail.toLowerCase(),
      createdAt: { gte: hoje }
    }
  });

  if (usosPorEmail >= 2) {
    return { valid: false, reason: 'Limite de usos do cupom por email excedido (máx. 2 por dia)' };
  }

  const usosPorTelegram = await prisma.couponUsage.count({
    where: {
      couponId: coupon.id,
      userTelegram: userTelegram.toLowerCase(),
      createdAt: { gte: hoje }
    }
  });

  if (usosPorTelegram >= 2) {
    return { valid: false, reason: 'Limite de usos do cupom por telegram excedido (máx. 2 por dia)' };
  }

  return { valid: true };
}

/**
 * Calcula o lucro estimado antes de confirmar pagamento.
 * Comissão e desconto são sobre o lucro das taxas (fee - custo), nunca sobre valor do boleto.
 * Se lucro líquido da plataforma < R$ 0,80 → bloquear.
 */
export function calculateEstimatedProfit(
  boletoAmount: number,
  fee: number,
  affiliateCommissionAmount: number = 0
): { profit: number; isValid: boolean } {
  const operationalCost = costForAmount(boletoAmount);
  const grossProfit = fee - operationalCost;
  const platformProfit = grossProfit - affiliateCommissionAmount;
  const MIN_PROFIT = 0.80;

  return {
    profit: parseFloat(Math.max(0, platformProfit).toFixed(2)),
    isValid: platformProfit >= MIN_PROFIT
  };
}

/**
 * Registra uso de cupom para auditoria (boleto)
 */
export async function logCouponUsage(
  couponId: string,
  userId: string,
  userEmail: string,
  userTelegram: string,
  userIp: string,
  deviceFingerprint: string | undefined,
  boletoId: string
): Promise<void> {
  await prisma.couponUsage.create({
    data: {
      couponId,
      userId,
      userEmail: userEmail.toLowerCase(),
      userTelegram: userTelegram.toLowerCase(),
      userIp,
      deviceFingerprint: deviceFingerprint || null,
      boletoId
    }
  });
}

/**
 * Registra uso de cupom em Receber Pix (DePix) para auditoria
 */
export async function logCouponUsageDepix(
  couponId: string,
  userId: string,
  userEmail: string,
  userTelegram: string,
  userIp: string,
  deviceFingerprint: string | undefined,
  depixOrderId: string
): Promise<void> {
  await prisma.couponUsage.create({
    data: {
      couponId,
      userId,
      userEmail: userEmail.toLowerCase(),
      userTelegram: userTelegram.toLowerCase(),
      userIp,
      deviceFingerprint: deviceFingerprint || null,
      boletoId: null,
      depixOrderId,
    },
  });
}

/**
 * Registra criação de conta para controle de limites
 */
export async function logAccountCreation(
  userId: string,
  ip: string,
  deviceFingerprint?: string
): Promise<void> {
  await prisma.accountCreation.create({
    data: {
      userId,
      ip,
      deviceFingerprint: deviceFingerprint || null
    }
  });
}
