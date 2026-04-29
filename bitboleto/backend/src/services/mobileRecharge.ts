import { prisma } from '../prisma';
import { validateCouponUsage, isUserVerified } from '../utils/antifraud';
import { getSafeErrorMessage } from '../utils/safeError';
import { getRates, convertBrlToUsdt, convertBrlToSats } from './exchangeRate';
import { REFERRAL_RATE } from '../utils/taxConfig';

if (typeof (prisma as any).mobileRecharge === 'undefined') {
  throw new Error(
    'Prisma client sem modelo mobileRecharge. Na pasta backend execute: npx prisma generate && npm run build && pm2 restart pagdepix-api'
  );
}

// Taxa recarga: 2% + R$ 0,99
const RECHARGE_FEE_PERCENT = 0.02;
const RECHARGE_FEE_FIXED = 0.99;

export interface MobileOperator {
  id: string;
  name: string;
  values: number[];
}

export const MOBILE_OPERATORS: MobileOperator[] = [
  { id: 'Vivo', name: 'Vivo', values: [20, 25, 30, 35, 40, 50, 100, 200, 300] },
  { id: 'Claro', name: 'Claro', values: [20, 25, 30, 35, 40, 50, 100, 200, 300] },
  { id: 'TIM', name: 'TIM', values: [20, 30, 40, 50, 60, 100] },
  { id: 'Correios Celular', name: 'Correios Celular', values: [20, 30, 45, 55, 75, 120, 150, 180, 225] },
  { id: 'Surf Telecom', name: 'Surf Telecom', values: [25, 30, 40, 50, 75, 180] },
];

// DDDs válidos no Brasil (11-19, 21-28, 31-38, 41-49, 51-59, 61-69, 71-79, 81-89, 91-99, exceto alguns não utilizados)
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99
]);

/**
 * Extrai só dígitos; se tiver 13 e começar com 55, considera DDD+9 (11 dígitos).
 * Retorna string de 11 dígitos (DDD + 9) ou vazio.
 */
function digitsOnly(input: string): string {
  const d = input.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) return d.slice(2);
  if (d.length === 11) return d;
  return '';
}

/**
 * Normaliza para +55DDDxxxxxxxxx (11 dígitos após +55).
 */
export function normalizePhone(input: string): string {
  const eleven = digitsOnly(input);
  if (eleven.length === 11) return `+55${eleven}`;
  return '';
}

/**
 * Valida: 11 dígitos (DDD + 9), DDD válido, celular (9 após DDD).
 */
export function validatePhone(input: string): { valid: boolean; error?: string } {
  const digits = digitsOnly(input);
  if (digits.length !== 11) {
    return { valid: false, error: 'O número deve ter 11 dígitos (DDD + número com 9 no início).' };
  }
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (!VALID_DDDS.has(ddd)) {
    return { valid: false, error: 'DDD inválido.' };
  }
  if (digits[2] !== '9') {
    return { valid: false, error: 'Número de celular deve começar com 9 após o DDD.' };
  }
  return { valid: true };
}

export function getOperatorById(id: string): MobileOperator | null {
  return MOBILE_OPERATORS.find((op) => op.id === id) || null;
}

export function validateOperatorAndAmount(operatorId: string, amount: number): { valid: boolean; error?: string } {
  const op = getOperatorById(operatorId);
  if (!op) {
    return { valid: false, error: 'Operadora inválida.' };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Valor inválido.' };
  }
  if (!op.values.includes(amount)) {
    return { valid: false, error: `Valores permitidos para ${op.name}: R$ ${op.values.join(', R$ ')}.` };
  }
  return { valid: true };
}

export function calculateRechargeFee(amount: number): { fee: number; totalAmount: number } {
  const fee = Math.ceil((amount * RECHARGE_FEE_PERCENT + RECHARGE_FEE_FIXED) * 100) / 100;
  const totalAmount = Math.ceil((amount + fee) * 100) / 100;
  return { fee, totalAmount };
}

/** Calcula taxa de recarga com cupom (para preview e criação). minAmount recarga = 20. */
export async function calculateRechargeWithCoupon(
  amount: number,
  options: { couponCode?: string; userId?: string; userIp?: string; deviceFingerprint?: string; paymentCurrency?: string }
): Promise<{
  isValid: boolean;
  error?: string;
  fee?: number;
  totalAmount?: number;
  depixAmount?: number;
  cupomValido?: boolean;
  descontoAplicado?: string;
  paymentCurrency?: string;
  exchangeRate?: number | null;
  cryptoAmount?: string | null;
}> {
  if (amount < 20 || !Number.isFinite(amount)) {
    return { isValid: false, error: 'Valor inválido. Mínimo R$ 20,00.' };
  }
  const { fee: baseFee, totalAmount: baseTotal } = calculateRechargeFee(amount);
  let fee = baseFee;
  let cupomValido = false;
  let descontoAplicado = '';

  if (options.couponCode && options.userId) {
    const user = await prisma.user.findUnique({
      where: { id: options.userId },
      select: { email: true, telegram: true }
    });
    if (!user) return { isValid: false, error: 'Usuário não encontrado.' };
    const verified = await isUserVerified(options.userId);
    if (!verified) return { isValid: false, error: 'Verifique seu e-mail e Telegram para usar cupom.' };

    const cupom = await prisma.coupon.findUnique({
      where: { code: options.couponCode.toUpperCase() }
    });
    const disponivel = cupom?.isActive && (cupom.maxUsage == null || cupom.usageCount < cupom.maxUsage);
    if (cupom && disponivel) {
      const validation = await validateCouponUsage(
        options.couponCode,
        options.userId,
        user.email,
        user.telegram,
        options.userIp ?? '',
        options.deviceFingerprint,
        amount,
        20
      );
      if (validation.valid) {
        // cupom.discount no banco é decimal (0 a 1), ex.: 0.02 = 2% de desconto na taxa (igual ao boleto)
        const discountFraction = Math.min(Math.max(0, Number(cupom.discount)), 1);
        fee = Math.ceil((baseFee * (1 - discountFraction)) * 100) / 100;
        cupomValido = true;
        descontoAplicado = `${(discountFraction * 100).toFixed(2).replace('.', ',')}%`;
      }
    }
  }

  const totalAmount = Math.ceil((amount + fee) * 100) / 100;
  const depixAmount = totalAmount;
  const cur = (options.paymentCurrency || 'DEPIX').toUpperCase();

  let exchangeRateVal: number | null = null;
  let cryptoAmountVal: string | null = null;

  if (cur === 'USDT' || cur === 'BTC') {
    try {
      const rates = await getRates();
      if (cur === 'USDT') {
        exchangeRateVal = rates.usdBrl;
        cryptoAmountVal = convertBrlToUsdt(totalAmount, rates.usdBrl).toFixed(2);
      } else {
        exchangeRateVal = rates.btcBrl;
        cryptoAmountVal = String(convertBrlToSats(totalAmount, rates.btcBrl));
      }
    } catch { /* cotação indisponível não bloqueia preview */ }
  }

  return {
    isValid: true,
    fee,
    totalAmount,
    depixAmount,
    cupomValido,
    descontoAplicado: cupomValido ? descontoAplicado : undefined,
    paymentCurrency: cur,
    exchangeRate: exchangeRateVal,
    cryptoAmount: cryptoAmountVal,
  };
}

// Acesso ao modelo MobileRecharge (Prisma gera como camelCase: mobileRecharge). Cast para compatibilidade de tipos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as typeof prisma & { mobileRecharge: any };

interface RechargeWalletConfig {
  walletAddress: string;
  walletAddressUsdt: string | null;
  walletAddressBtc: string | null;
  rateLockMinutes: number;
}

async function getWalletConfig(): Promise<RechargeWalletConfig> {
  const fallback = process.env.LIQUID_WALLET_ADDRESS || 'lq1qqgskhge4cunhw32799ky9wlaavt83xu0klvvz78yg4ugzr3dmq2t0gm4gyfdr59yhaq7anhkg52ha666d0nkys56jh979wyp7';
  try {
    const config = await prisma.config.findUnique({ where: { id: 'config' } });
    if (config?.walletAddress) return {
      walletAddress: config.walletAddress,
      walletAddressUsdt: config.walletAddressUsdt,
      walletAddressBtc: config.walletAddressBtc,
      rateLockMinutes: config.rateLockMinutes,
    };
    await prisma.config.create({
      data: { id: 'config', walletAddress: fallback, qrCodeUrl: '/qr-code.png' }
    });
    return { walletAddress: fallback, walletAddressUsdt: null, walletAddressBtc: null, rateLockMinutes: 10 };
  } catch (e) {
    console.warn('Config/wallet não encontrado, usando fallback:', (e as Error).message);
    return { walletAddress: fallback, walletAddressUsdt: null, walletAddressBtc: null, rateLockMinutes: 10 };
  }
}

function pickRechargeWallet(config: RechargeWalletConfig, currency: string): string {
  if (currency === 'USDT') {
    if (!config.walletAddressUsdt) throw new Error('Carteira USDT não configurada. Entre em contato com o suporte.');
    return config.walletAddressUsdt;
  }
  if (currency === 'BTC') {
    if (!config.walletAddressBtc) throw new Error('Carteira Bitcoin não configurada. Entre em contato com o suporte.');
    return config.walletAddressBtc;
  }
  return config.walletAddress;
}

export interface CreateRechargeInput {
  userId: string;
  operator: string;
  phoneNumber: string;
  amount: number;
  couponCode?: string;
  userIp?: string;
  deviceFingerprint?: string;
  paymentCurrency?: 'DEPIX' | 'USDT' | 'BTC';
}

export interface CreateRechargeResult {
  success: boolean;
  recharge?: any;
  error?: string;
}

export async function createRecharge(input: CreateRechargeInput): Promise<CreateRechargeResult> {
  try {
    const { userId, operator, phoneNumber, amount, couponCode, userIp, deviceFingerprint, paymentCurrency: currency = 'DEPIX' } = input;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: 'Usuário não encontrado.' };
    if (user.isBlocked || !user.isActive) return { success: false, error: 'Conta indisponível. Entre em contato com o suporte.' };

    const digits = String(phoneNumber).replace(/\D/g, '').replace(/^55/, '').slice(0, 11);
    const phoneValidation = validatePhone(digits);
    if (!phoneValidation.valid) return { success: false, error: phoneValidation.error };

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) return { success: false, error: 'Valor inválido.' };

    const opAmountValidation = validateOperatorAndAmount(operator, numAmount);
    if (!opAmountValidation.valid) return { success: false, error: opAmountValidation.error };

    const normalized = normalizePhone(digits);
    if (!normalized || normalized.length !== 14) return { success: false, error: 'Número inválido. Use DDD + 9 dígitos (celular).' };

    let fee: number;
    let totalAmount: number;
    let depixAmount: number;
    let couponId: string | null = null;
    let affiliateId: string | null = null;
    let couponUsed: string | null = null;

    if (couponCode) {
      const calc = await calculateRechargeWithCoupon(numAmount, {
        couponCode,
        userId,
        userIp,
        deviceFingerprint
      });
      if (!calc.isValid) return { success: false, error: calc.error };
      fee = calc.fee!;
      totalAmount = calc.totalAmount!;
      depixAmount = calc.depixAmount!;
      const cupom = await prisma.coupon.findUnique({
        where: { code: couponCode.toUpperCase() },
        include: { affiliate: true }
      });
      if (cupom && calc.cupomValido) {
        couponId = cupom.id;
        couponUsed = couponCode.toUpperCase();
        affiliateId = cupom.affiliateId ?? null;
      }
    } else {
      const base = calculateRechargeFee(numAmount);
      fee = base.fee;
      totalAmount = base.totalAmount;
      depixAmount = totalAmount;
    }

    const walletConfig = await getWalletConfig();

    let walletAddr: string;
    try {
      walletAddr = pickRechargeWallet(walletConfig, currency);
    } catch (err: any) {
      return { success: false, error: err.message };
    }

    let exchangeRateVal: number | null = null;
    let cryptoAmountVal: string | null = null;
    let rateLockExpiresAt: Date | null = null;

    if (currency === 'USDT') {
      const rates = await getRates();
      exchangeRateVal = rates.usdBrl;
      cryptoAmountVal = convertBrlToUsdt(totalAmount, rates.usdBrl).toFixed(2);
      rateLockExpiresAt = new Date(Date.now() + walletConfig.rateLockMinutes * 60_000);
    } else if (currency === 'BTC') {
      const rates = await getRates();
      exchangeRateVal = rates.btcBrl;
      cryptoAmountVal = String(convertBrlToSats(totalAmount, rates.btcBrl));
      rateLockExpiresAt = new Date(Date.now() + walletConfig.rateLockMinutes * 60_000);
    }

    const recharge = await prisma.mobileRecharge.create({
      data: {
        userId,
        operator: String(operator).trim(),
        phoneNumber: normalized,
        amount: numAmount,
        fee,
        totalAmount,
        depixAmount,
        walletAddress: walletAddr,
        status: 'PENDING',
        couponId: couponId ?? undefined,
        affiliateId: affiliateId ?? undefined,
        couponUsed: couponUsed ?? undefined,
        paymentCurrency: currency as any,
        exchangeRate: exchangeRateVal,
        cryptoAmount: cryptoAmountVal,
        rateLockExpiresAt,
      },
      include: {
        user: { select: { id: true, name: true, email: true, telegram: true } }
      }
    });

    // NÃO incrementar usageCount nem criar comissão aqui
    // Isso será feito apenas quando a recarga for aprovada (adminApproveRechargeWithReceipt)

    return {
      success: true,
      recharge: {
        id: recharge.id,
        operator: recharge.operator,
        phoneNumber: recharge.phoneNumber,
        amount: recharge.amount,
        fee: recharge.fee,
        totalAmount: recharge.totalAmount,
        depixAmount: recharge.depixAmount,
        walletAddress: recharge.walletAddress,
        status: recharge.status,
        couponUsed: recharge.couponUsed,
        txid: (recharge as any).txid ?? null,
        receiptUrl: (recharge as any).receiptUrl ?? null,
        createdAt: recharge.createdAt,
        paymentCurrency: (recharge as any).paymentCurrency,
        exchangeRate: (recharge as any).exchangeRate,
        cryptoAmount: (recharge as any).cryptoAmount,
        rateLockExpiresAt: (recharge as any).rateLockExpiresAt,
      }
    };
  } catch (e) {
    const err = e as Error & { code?: string; meta?: unknown };
    const msg = err.message ?? '';
    console.error('Erro ao criar recarga:', e);
    if (err.code === 'P2003') return { success: false, error: 'Dados inválidos. Verifique usuário ou configuração.' };
    if (err.code === 'P2002') return { success: false, error: 'Recarga duplicada. Tente novamente.' };
    if (msg.includes('Unknown arg') || msg.includes('Invalid prisma') || msg.includes("reading 'create'") || msg.includes('mobileRecharge')) {
      return { success: false, error: 'Recargas indisponíveis: o servidor precisa ser atualizado. O administrador deve executar na pasta backend: npx prisma generate e npx prisma migrate deploy, depois reiniciar o servidor.' };
    }
    return { success: false, error: getSafeErrorMessage(e, 'Erro ao criar recarga. Tente novamente.') };
  }
}

export async function listUserRecharges(userId: string, options?: { status?: string; page?: number; limit?: number }) {
  const page = options?.page ?? 1;
  const limit = Math.min(options?.limit ?? 20, 50);
  const skip = (page - 1) * limit;
  const status = options?.status;

  const where: any = { userId };
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.mobileRecharge.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        operator: true,
        phoneNumber: true,
        amount: true,
        fee: true,
        totalAmount: true,
        depixAmount: true,
        walletAddress: true,
        status: true,
        txid: true,
        receiptUrl: true,
        couponUsed: true,
        createdAt: true,
        paidAt: true
      }
    }),
    prisma.mobileRecharge.count({ where })
  ]);

  return { recharges: items, total, page, limit };
}

export async function getRechargeById(rechargeId: string, userId: string) {
  const recharge = await prisma.mobileRecharge.findFirst({
    where: { id: rechargeId, userId },
    include: { user: { select: { id: true, name: true, email: true, telegram: true } } }
  });
  return recharge;
}

/** Só permite editar o número enquanto status for PENDING. Após PAID, imutável. */
export async function updateRechargePhone(
  rechargeId: string,
  userId: string,
  newPhoneInput: string
): Promise<{ success: boolean; error?: string; recharge?: any }> {
  const recharge = await prisma.mobileRecharge.findFirst({
    where: { id: rechargeId, userId }
  });
  if (!recharge) return { success: false, error: 'Recarga não encontrada.' };
  if (recharge.status !== 'PENDING') {
    return { success: false, error: 'O número não pode ser alterado após o pagamento ser confirmado.' };
  }

  const phoneValidation = validatePhone(newPhoneInput.replace(/\D/g, ''));
  if (!phoneValidation.valid) return { success: false, error: phoneValidation.error };

  const normalized = normalizePhone(newPhoneInput.replace('+55', ''));
  if (!normalized) return { success: false, error: 'Número inválido.' };

  const updated = await prisma.mobileRecharge.update({
    where: { id: rechargeId },
    data: { phoneNumber: normalized },
    include: { user: { select: { id: true, name: true, email: true, telegram: true } } }
  });

  return { success: true, recharge: updated };
}

/** Registra o TXID da transação Depix enviado pelo usuário (recarga PENDING). */
export async function updateRechargeTxid(
  rechargeId: string,
  userId: string,
  txid: string
): Promise<{ success: boolean; error?: string; recharge?: any }> {
  const recharge = await prisma.mobileRecharge.findFirst({
    where: { id: rechargeId, userId }
  });
  if (!recharge) return { success: false, error: 'Recarga não encontrada.' };
  if (recharge.status !== 'PENDING') {
    return { success: false, error: 'Só é possível informar TXID em recarga aguardando pagamento.' };
  }
  const txidTrim = String(txid).trim();
  if (txidTrim.length < 10) return { success: false, error: 'TXID inválido (informe pelo menos 10 caracteres).' };

  // Rate lock: rejeitar se cotação expirou (USDT/BTC)
  if ((recharge as any).rateLockExpiresAt && new Date() > new Date((recharge as any).rateLockExpiresAt)) {
    await prisma.mobileRecharge.update({ where: { id: rechargeId }, data: { rateExpired: true } as any });
    return { success: false, error: 'Cotação expirada. Crie uma nova recarga com cotação atualizada.' };
  }

  // Anti-replay cross-tabela
  const [existingBoleto, existingRecharge] = await Promise.all([
    prisma.boleto.findFirst({ where: { txid: txidTrim } }),
    prisma.mobileRecharge.findFirst({ where: { txid: txidTrim, id: { not: rechargeId } } }),
  ]);
  if (existingBoleto || existingRecharge) {
    return { success: false, error: 'Este TXID já foi utilizado em outra transação.' };
  }

  const updated = await prisma.mobileRecharge.update({
    where: { id: rechargeId },
    data: { txid: txidTrim },
    include: { user: { select: { id: true, name: true, email: true, telegram: true } } }
  });
  return { success: true, recharge: updated };
}

// --- Admin: listar recargas e marcar como pago
export async function adminListRecharges(options?: { status?: string; page?: number; limit?: number }) {
  const page = options?.page ?? 1;
  const limit = Math.min(options?.limit ?? 50, 100);
  const skip = (page - 1) * limit;
  const where: any = { txid: { not: null } };
  if (options?.status) where.status = options.status;

  const [items, total] = await Promise.all([
    prisma.mobileRecharge.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true, telegram: true } }
      }
    }),
    prisma.mobileRecharge.count({ where })
  ]);

  return { recharges: items, total, page, limit };
}

export async function adminMarkRechargePaid(rechargeId: string): Promise<{ success: boolean; error?: string; recharge?: any }> {
  const recharge = await prisma.mobileRecharge.findUnique({ where: { id: rechargeId } });
  if (!recharge) return { success: false, error: 'Recarga não encontrada.' };
  if (recharge.status === 'PAID') return { success: false, error: 'Recarga já está paga.' };

  const updated = await prisma.mobileRecharge.update({
    where: { id: rechargeId },
    data: { status: 'PAID', paidAt: new Date() },
    include: { user: { select: { id: true, name: true, email: true, telegram: true } } }
  });

  // Unificar total processado: somar recarga ao totalPaid do usuário (dashboard)
  await prisma.user.update({
    where: { id: recharge.userId },
    data: { totalPaid: { increment: recharge.totalAmount } },
  });

  // Comissão de indicação (referral)
  try {
    const rechargeOwner = await prisma.user.findUnique({ where: { id: recharge.userId }, select: { referredByCode: true } });
    if (rechargeOwner?.referredByCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode: rechargeOwner.referredByCode }, select: { id: true } });
      if (referrer) {
        const referralCommission = Math.floor(recharge.fee * REFERRAL_RATE * 100) / 100;
        await (prisma as any).referralEarning.create({
          data: { earnerId: referrer.id, sourceUserId: recharge.userId, rechargeId: recharge.id, feeAmount: recharge.fee, commission: referralCommission }
        });
        console.log(`[REFERRAL] ✅ Comissão de recarga criada: rechargeId=${recharge.id}, referrerId=${referrer.id}, commission=${referralCommission}`);
        try { const { notifyAffiliateCommission } = require('./push.service'); notifyAffiliateCommission(referrer.id, referralCommission).catch(() => {}); } catch (_e) {}
        try { const { notifyUserByTelegram } = require('./telegram.service'); notifyUserByTelegram(referrer.id, `🎉 Nova comissão de indicação!\n\nVocê ganhou R$ ${referralCommission.toFixed(2)} pela aprovação de uma recarga do seu indicado.`).catch(() => {}); } catch (_e) {}
      }
    }
  } catch (error) {
    console.error(`[REFERRAL] ❌ Erro ao criar comissão de indicação para recarga ${recharge.id}:`, error);
  }

  return { success: true, recharge: updated };
}

/** Aprova recarga (marca como paga) e salva URL do comprovante de liquidação. Exige comprovante. */
export async function adminApproveRechargeWithReceipt(
  rechargeId: string,
  receiptUrl: string
): Promise<{ success: boolean; error?: string; recharge?: any }> {
  const recharge = await prisma.mobileRecharge.findUnique({ where: { id: rechargeId } });
  if (!recharge) return { success: false, error: 'Recarga não encontrada.' };
  if (recharge.status === 'PAID') return { success: false, error: 'Recarga já está paga.' };
  if (!receiptUrl || receiptUrl.trim() === '') return { success: false, error: 'Comprovante de liquidação é obrigatório.' };

  const updated = await prisma.mobileRecharge.update({
    where: { id: rechargeId },
    data: { status: 'PAID', paidAt: new Date(), receiptUrl: receiptUrl.trim() },
    include: { user: { select: { id: true, name: true, email: true, telegram: true } } }
  });

  // Unificar total processado: somar recarga ao totalPaid do usuário (dashboard)
  await prisma.user.update({
    where: { id: recharge.userId },
    data: { totalPaid: { increment: recharge.totalAmount } },
  });

  // Comissão de indicação (referral)
  try {
    const rechargeOwner = await prisma.user.findUnique({ where: { id: recharge.userId }, select: { referredByCode: true } });
    if (rechargeOwner?.referredByCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode: rechargeOwner.referredByCode }, select: { id: true } });
      if (referrer) {
        const referralCommission = Math.floor(recharge.fee * REFERRAL_RATE * 100) / 100;
        await (prisma as any).referralEarning.create({
          data: { earnerId: referrer.id, sourceUserId: recharge.userId, rechargeId: recharge.id, feeAmount: recharge.fee, commission: referralCommission }
        });
        console.log(`[REFERRAL] ✅ Comissão de recarga (com comprovante) criada: rechargeId=${recharge.id}, referrerId=${referrer.id}, commission=${referralCommission}`);
        try { const { notifyAffiliateCommission } = require('./push.service'); notifyAffiliateCommission(referrer.id, referralCommission).catch(() => {}); } catch (_e) {}
        try { const { notifyUserByTelegram } = require('./telegram.service'); notifyUserByTelegram(referrer.id, `🎉 Nova comissão de indicação!\n\nVocê ganhou R$ ${referralCommission.toFixed(2)} pela aprovação de uma recarga do seu indicado.`).catch(() => {}); } catch (_e) {}
      }
    }
  } catch (error) {
    console.error(`[REFERRAL] ❌ Erro ao criar comissão de indicação para recarga ${recharge.id}:`, error);
  }

  // Se tem afiliado (cupom OU API), criar comissão quando recarga aprovada
  if (recharge.affiliateId) {
    // Verificar se já existe transação (idempotência)
    const existingTransaction = await prisma.affiliateTransaction.findFirst({
      where: {
        affiliateId: recharge.affiliateId,
        mobileRechargeId: recharge.id as any
      }
    });

    if (existingTransaction) {
      // Se já existe e está PENDING, mover para AVAILABLE
      if (existingTransaction.status === 'PENDING') {
        await prisma.affiliateTransaction.update({
          where: { id: existingTransaction.id },
          data: {
            status: 'AVAILABLE',
            availableAt: new Date()
          }
        });

        // Mover de pendingBalance para balance
        await prisma.affiliate.update({
          where: { id: recharge.affiliateId },
          data: {
            pendingBalance: { decrement: existingTransaction.commission },
            balance: { increment: existingTransaction.commission }
          }
        });
      }
    } else {
      // Criar comissão agora que a recarga foi aprovada
      const RECHARGE_COST_PERCENT = 0.02;
      const RECHARGE_COST_FIXED = 0.99;
      const cost = recharge.amount * RECHARGE_COST_PERCENT + RECHARGE_COST_FIXED;
      const profit = Math.max(0, recharge.fee - cost);
      const commissionAmount = Math.floor(profit * 0.20 * 100) / 100; // 20% do lucro

      if (commissionAmount > 0) {
        try {
          // Criar transação como AVAILABLE (já está aprovada)
          await prisma.affiliateTransaction.create({
            data: {
              affiliateId: recharge.affiliateId,
              mobileRechargeId: recharge.id as any,
              amount: recharge.totalAmount,
              commission: commissionAmount,
              status: 'AVAILABLE',
              availableAt: new Date()
            }
          });

          // Creditar diretamente no balance (já está aprovada)
          await prisma.affiliate.update({
            where: { id: recharge.affiliateId },
            data: {
              balance: { increment: commissionAmount },
              totalEarned: { increment: commissionAmount }
            }
          });

          const source = (recharge as any).apiKeyId ? 'API' : 'cupom';
          console.log(`[AFFILIATE] ✅ Comissão de recarga criada após aprovação (${source}): rechargeId=${recharge.id}, affiliateId=${recharge.affiliateId}, commission=${commissionAmount}`);
        } catch (error) {
          console.error(`[AFFILIATE] ❌ Erro ao criar comissão para recarga ${recharge.id}:`, error);
        }
      }
    }

    // Incrementar usageCount do cupom apenas quando há cupom associado
    if (recharge.couponId) {
      try {
        await prisma.coupon.update({
          where: { id: recharge.couponId },
          data: { usageCount: { increment: 1 } }
        });
        console.log(`[AFFILIATE] ✅ usageCount incrementado para cupom ${recharge.couponId} após aprovação da recarga`);
      } catch (error) {
        console.error(`[AFFILIATE] ❌ Erro ao incrementar usageCount do cupom ${recharge.couponId}:`, error);
      }
    }
  }

  return { success: true, recharge: updated };
}

/** Reprovar recarga (marca como cancelada). */
export async function adminRejectRecharge(rechargeId: string): Promise<{ success: boolean; error?: string; recharge?: any }> {
  const recharge = await prisma.mobileRecharge.findUnique({ where: { id: rechargeId } });
  if (!recharge) return { success: false, error: 'Recarga não encontrada.' };
  if (recharge.status === 'PAID') return { success: false, error: 'Recarga já está paga.' };
  if (recharge.status === 'CANCELLED') return { success: false, error: 'Recarga já foi cancelada.' };

  const updated = await prisma.mobileRecharge.update({
    where: { id: rechargeId },
    data: { status: 'CANCELLED' },
    include: { user: { select: { id: true, name: true, email: true, telegram: true } } }
  });

  return { success: true, recharge: updated };
}
