import Decimal from 'decimal.js';
import { prisma } from '../prisma';
import { validateCouponUsage, isUserVerified } from '../utils/antifraud';
import { getSafeErrorMessage } from '../utils/safeError';
import { getRates } from './exchangeRate';
import { calculateTax, getTaxRule, MIN_BOLETO_AMOUNT, MAX_BOLETO_AMOUNT, REFERRAL_RATE, getAffiliateCommissionFromProfit, costForAmount } from '../utils/taxConfig';
import { isXpubConfigured, getNextAddressIndex, deriveLiquidAddress } from './liquidHdWallet.service';
import { env } from '../config/env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as typeof prisma & { billPayment: any };

async function getWalletConfig() {
  const fallback = env.LIQUID_WALLET_ADDRESS;
  try {
    const config = await prisma.config.findUnique({ where: { id: 'config' } });
    if (config?.walletAddress) return {
      walletAddress: config.walletAddress,
      walletAddressUsdt: config.walletAddressUsdt,
      walletAddressBtc: config.walletAddressBtc,
      rateLockMinutes: config.rateLockMinutes,
    };
    return { walletAddress: fallback, walletAddressUsdt: null, walletAddressBtc: null, rateLockMinutes: 10 };
  } catch {
    return { walletAddress: fallback, walletAddressUsdt: null, walletAddressBtc: null, rateLockMinutes: 10 };
  }
}

function pickWallet(config: { walletAddress: string; walletAddressUsdt: string | null; walletAddressBtc: string | null }, currency: string): string {
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

// Parseia valor do código de barras bancário (44 dígitos), linha digitável (47) ou concessionária (48)
export function parseBarcodeAmount(barcode: string): number | null {
  const digits = barcode.replace(/\D/g, '');
  const maxCents = Math.round(MAX_BOLETO_AMOUNT * 100);

  function extractCents(str: string): number | null {
    const cents = parseInt(str, 10);
    if (!Number.isFinite(cents) || cents <= 0) return null;
    if (cents > maxCents) return null;
    return cents;
  }

  if (digits.length === 44) {
    if (!/^\d{44}$/.test(digits)) return null;
    // Código de barras bancário: posições 9-18 = valor em centavos (10 dígitos)
    const cents = extractCents(digits.slice(9, 19));
    return cents !== null ? cents / 100 : null;
  }

  if (digits.length === 47) {
    if (!/^\d{47}$/.test(digits)) return null;
    // Linha digitável bancária: Campo 5 = posições 33-46
    // Posições 33-36 = fator vencimento (4 dígitos); posições 37-46 = valor em centavos (10 dígitos)
    const cents = extractCents(digits.slice(37, 47));
    return cents !== null ? cents / 100 : null;
  }

  if (digits.length === 48) {
    if (!/^\d{48}$/.test(digits)) return null;
    // Concessionária: posições 5-14 = valor em centavos (10 dígitos)
    const cents = extractCents(digits.slice(5, 15));
    return cents !== null ? cents / 100 : null;
  }

  return null;
}

export async function previewBillPayment(
  amount: number,
  options: { couponCode?: string; userId?: string; userIp?: string; deviceFingerprint?: string; paymentCurrency?: string }
): Promise<{
  isValid: boolean;
  error?: string;
  fee?: number;
  feeBeforeCoupon?: number;
  totalAmount?: number;
  depixAmount?: number;
  cupomValido?: boolean;
  descontoAplicado?: string;
  paymentCurrency?: string;
  exchangeRate?: number | null;
  cryptoAmount?: string | null;
  percentageFormatted?: string;
  fixedFee?: number;
  rateTimestamp?: string | null;
  rateError?: boolean;
}> {
  if (!Number.isFinite(amount) || amount < MIN_BOLETO_AMOUNT) {
    return { isValid: false, error: `Valor mínimo: R$ ${MIN_BOLETO_AMOUNT.toFixed(2).replace('.', ',')}.` };
  }
  if (amount > MAX_BOLETO_AMOUNT) {
    return { isValid: false, error: `Valor máximo: R$ ${MAX_BOLETO_AMOUNT.toFixed(2).replace('.', ',')}.` };
  }

  const taxCalc = calculateTax(amount);
  if (!taxCalc.isValid) return { isValid: false, error: 'Valor fora da faixa permitida.' };

  let fee = taxCalc.taxAmount;
  let cupomValido = false;
  let descontoAplicado = '';

  if (options.couponCode && options.userId) {
    const user = await prisma.user.findUnique({ where: { id: options.userId }, select: { email: true, telegram: true } });
    if (!user) return { isValid: false, error: 'Usuário não encontrado.' };
    const verified = await isUserVerified(options.userId);
    if (!verified) return { isValid: false, error: 'Verifique seu e-mail e Telegram para usar cupom.' };

    const cupom = await prisma.coupon.findUnique({ where: { code: options.couponCode.toUpperCase() } });
    const disponivel = cupom?.isActive && (cupom.maxUsage == null || cupom.usageCount < cupom.maxUsage);
    if (cupom && disponivel) {
      const validation = await validateCouponUsage(
        options.couponCode, options.userId, user.email, user.telegram,
        options.userIp ?? '', options.deviceFingerprint, amount, MIN_BOLETO_AMOUNT
      );
      if (validation.valid) {
        const discountFraction = Math.min(Math.max(0, Number(cupom.discount)), 1);
        const calc = calculateTax(amount, discountFraction);
        fee = calc.taxAmount;
        cupomValido = true;
        descontoAplicado = `${(discountFraction * 100).toFixed(2).replace('.', ',')}%`;
      }
    }
  }

  const totalAmount = parseFloat((amount + fee).toFixed(2));
  const depixAmount = totalAmount;
  const cur = (options.paymentCurrency || 'DEPIX').toUpperCase();

  let exchangeRateVal: number | null = null;
  let cryptoAmountVal: string | null = null;
  let rateTimestamp: string | null = null;
  let rateError = false;

  if (cur === 'DEPIX') {
    cryptoAmountVal = totalAmount.toFixed(2);
    exchangeRateVal = 1;
    rateTimestamp = new Date().toISOString();
  } else if (cur === 'USDT' || cur === 'BTC') {
    try {
      const rates = await getRates();
      rateTimestamp = rates.fetchedAt.toISOString();
      if (cur === 'USDT') {
        exchangeRateVal = rates.usdBrl;
        cryptoAmountVal = new Decimal(totalAmount)
          .div(rates.usdBrl)
          .toDecimalPlaces(2, Decimal.ROUND_CEIL)
          .toFixed(2);
      } else {
        exchangeRateVal = rates.btcBrl;
        cryptoAmountVal = String(
          new Decimal(totalAmount).div(rates.btcBrl).mul(1e8).ceil().toNumber()
        );
      }
    } catch (err) {
      console.error('[previewBillPayment] Falha ao obter cotação:', err);
      rateError = true;
    }
  }

  const rule = getTaxRule(amount);

  return {
    isValid: true,
    fee,
    feeBeforeCoupon: taxCalc.taxAmount,
    totalAmount,
    depixAmount,
    cupomValido,
    descontoAplicado: cupomValido ? descontoAplicado : undefined,
    paymentCurrency: cur,
    exchangeRate: exchangeRateVal,
    cryptoAmount: cryptoAmountVal,
    percentageFormatted: rule ? `${(rule.percentage * 100).toFixed(2).replace('.', ',')}%` : undefined,
    fixedFee: rule?.fixedFee,
    rateTimestamp,
    rateError,
  };
}

export interface CreateBillPaymentInput {
  userId: string;
  barcode?: string;
  digitableLine?: string;
  amount: number;
  couponCode?: string;
  userIp?: string;
  deviceFingerprint?: string;
  paymentCurrency?: 'DEPIX' | 'USDT' | 'BTC';
}

export interface CreateBillPaymentResult {
  success: boolean;
  billPayment?: any;
  error?: string;
}

export async function createBillPayment(input: CreateBillPaymentInput): Promise<CreateBillPaymentResult> {
  try {
    const {
      userId, barcode, digitableLine, amount,
      couponCode, userIp, deviceFingerprint, paymentCurrency: currency = 'DEPIX',
    } = input;

    if (!barcode && !digitableLine) return { success: false, error: 'Informe o código de barras ou linha digitável.' };

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: 'Usuário não encontrado.' };
    if (user.isBlocked || !user.isActive) return { success: false, error: 'Conta indisponível. Entre em contato com o suporte.' };

    let numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount < MIN_BOLETO_AMOUNT) {
      return { success: false, error: `Valor mínimo: R$ ${MIN_BOLETO_AMOUNT.toFixed(2).replace('.', ',')}.` };
    }
    if (numAmount > MAX_BOLETO_AMOUNT) {
      return { success: false, error: `Valor máximo: R$ ${MAX_BOLETO_AMOUNT.toFixed(2).replace('.', ',')}.` };
    }

    const taxCalc = calculateTax(numAmount);
    if (!taxCalc.isValid) return { success: false, error: 'Valor fora da faixa permitida.' };

    let fee = taxCalc.taxAmount;
    let couponId: string | null = null;
    let affiliateId: string | null = null;
    let couponUsed: string | null = null;

    if (couponCode) {
      const preview = await previewBillPayment(numAmount, { couponCode, userId, userIp, deviceFingerprint });
      if (!preview.isValid) return { success: false, error: preview.error };
      fee = preview.fee!;
      if (preview.cupomValido) {
        const cupom = await prisma.coupon.findUnique({
          where: { code: couponCode.toUpperCase() },
          include: { affiliate: true },
        });
        if (cupom) {
          couponId = cupom.id;
          couponUsed = couponCode.toUpperCase();
          affiliateId = cupom.affiliateId ?? null;
        }
      }
    }

    const totalAmount = parseFloat((numAmount + fee).toFixed(2));
    const depixAmount = totalAmount;

    const walletConfig = await getWalletConfig();
    let walletAddr: string;
    let liquidAddressIndex: number | null = null;

    if (isXpubConfigured()) {
      try {
        liquidAddressIndex = await getNextAddressIndex(prisma);
        walletAddr = deriveLiquidAddress(env.LIQUID_XPUB, env.LIQUID_MASTER_BLINDING_KEY, liquidAddressIndex);
      } catch {
        liquidAddressIndex = null;
        walletAddr = pickWallet(walletConfig, currency);
      }
    } else {
      walletAddr = pickWallet(walletConfig, currency);
    }

    let exchangeRateVal: number | null = null;
    let cryptoAmountVal: string | null = null;
    let rateLockExpiresAt: Date | null = null;
    let rateProvider: string | null = null;
    let rateTimestamp: Date | null = null;

    if (currency === 'DEPIX') {
      cryptoAmountVal = totalAmount.toFixed(2);
      exchangeRateVal = 1;
      rateProvider = 'fixed';
      rateTimestamp = new Date();
    } else if (currency === 'USDT' || currency === 'BTC') {
      let rates: Awaited<ReturnType<typeof getRates>>;
      try {
        rates = await getRates();
      } catch {
        return { success: false, error: 'Cotação indisponível. Tente novamente em instantes.' };
      }
      rateProvider = rates.provider;
      rateTimestamp = rates.fetchedAt;
      rateLockExpiresAt = new Date(Date.now() + walletConfig.rateLockMinutes * 60_000);
      if (currency === 'USDT') {
        exchangeRateVal = rates.usdBrl;
        cryptoAmountVal = new Decimal(totalAmount)
          .div(rates.usdBrl)
          .toDecimalPlaces(2, Decimal.ROUND_CEIL)
          .toFixed(2);
      } else {
        exchangeRateVal = rates.btcBrl;
        cryptoAmountVal = String(
          new Decimal(totalAmount).div(rates.btcBrl).mul(1e8).ceil().toNumber()
        );
      }
    }

    const MAX_INDEX_RETRIES = 3;
    let billPayment: any;
    for (let attempt = 0; attempt <= MAX_INDEX_RETRIES; attempt++) {
      try {
        billPayment = await db.$transaction(async (tx: any) => {
          if (couponId) {
            const rows: any[] = await tx.$queryRaw`
              SELECT id, "usageCount", "maxUsage", "isActive"
              FROM "Coupon"
              WHERE id = ${couponId}
              FOR UPDATE
            `;
            const coupon = rows[0];
            if (!coupon?.isActive) throw new Error('COUPON_INACTIVE');
            if (coupon.maxUsage != null && coupon.usageCount >= coupon.maxUsage) throw new Error('COUPON_EXHAUSTED');
          }

          return tx.billPayment.create({
            data: {
              userId,
              barcode: barcode?.replace(/\D/g, '') ?? null,
              digitableLine: digitableLine ?? null,
              amount: numAmount,
              fee,
              totalAmount,
              depixAmount,
              walletAddress: walletAddr,
              liquidAddressIndex: liquidAddressIndex ?? undefined,
              status: 'PENDING',
              couponId: couponId ?? undefined,
              affiliateId: affiliateId ?? undefined,
              couponUsed: couponUsed ?? undefined,
              paymentCurrency: currency as any,
              exchangeRate: exchangeRateVal,
              cryptoAmount: cryptoAmountVal,
              rateLockExpiresAt,
              rateProvider: rateProvider ?? undefined,
              rateTimestamp: rateTimestamp ?? undefined,
              userIp: userIp ?? '',
            },
            include: { user: { select: { id: true, name: true, email: true } } },
          });
        }, { timeout: 5000 });
        break;
      } catch (err: any) {
        if (err?.message === 'COUPON_EXHAUSTED') return { success: false, error: 'Cupom esgotado.' };
        if (err?.message === 'COUPON_INACTIVE') return { success: false, error: 'Cupom inativo.' };
        if (err?.code === 'P2002' && liquidAddressIndex !== null && attempt < MAX_INDEX_RETRIES) {
          try {
            liquidAddressIndex = await getNextAddressIndex(prisma);
            walletAddr = deriveLiquidAddress(env.LIQUID_XPUB, env.LIQUID_MASTER_BLINDING_KEY, liquidAddressIndex);
          } catch {
            liquidAddressIndex = null;
            walletAddr = pickWallet(walletConfig, currency);
          }
          continue;
        }
        throw err;
      }
    }

    return {
      success: true,
      billPayment: {
        id: billPayment.id,
        barcode: billPayment.barcode,
        digitableLine: billPayment.digitableLine,
        amount: billPayment.amount,
        fee: billPayment.fee,
        totalAmount: billPayment.totalAmount,
        depixAmount: billPayment.depixAmount,
        walletAddress: billPayment.walletAddress,
        status: billPayment.status,
        couponUsed: billPayment.couponUsed,
        createdAt: billPayment.createdAt,
        paymentCurrency: billPayment.paymentCurrency,
        exchangeRate: billPayment.exchangeRate,
        cryptoAmount: billPayment.cryptoAmount,
        rateLockExpiresAt: billPayment.rateLockExpiresAt,
        rateProvider: billPayment.rateProvider,
        rateTimestamp: billPayment.rateTimestamp,
      },
    };
  } catch (e) {
    const err = e as Error & { code?: string };
    console.error('[createBillPayment] Erro:', e);
    if (err.code === 'P2003') return { success: false, error: 'Dados inválidos.' };
    if (err.code === 'P2002') return { success: false, error: 'Pagamento duplicado. Tente novamente.' };
    return { success: false, error: getSafeErrorMessage(e, 'Erro ao criar pagamento. Tente novamente.') };
  }
}

export async function updateBillPaymentTxid(
  billPaymentId: string,
  userId: string,
  txid: string,
): Promise<{ success: boolean; error?: string; billPayment?: any }> {
  const bp = await db.billPayment.findFirst({ where: { id: billPaymentId, userId } });
  if (!bp) return { success: false, error: 'Pagamento não encontrado.' };
  if (bp.status !== 'PENDING') return { success: false, error: 'TXID só pode ser informado em pagamento aguardando.' };

  const txidTrim = String(txid).trim();
  if (txidTrim.length < 10) return { success: false, error: 'TXID inválido.' };

  if (bp.rateLockExpiresAt && new Date() > new Date(bp.rateLockExpiresAt)) {
    await db.billPayment.update({ where: { id: billPaymentId }, data: { rateExpired: true } });
    return { success: false, error: 'Cotação expirada. Crie um novo pedido.' };
  }

  const [existingBoleto, existingBP] = await Promise.all([
    prisma.boleto.findFirst({ where: { txid: txidTrim } }),
    db.billPayment.findFirst({ where: { txid: txidTrim, id: { not: billPaymentId } } }),
  ]);
  if (existingBoleto || existingBP) return { success: false, error: 'TXID já utilizado em outra transação.' };

  const updated = await db.billPayment.update({
    where: { id: billPaymentId },
    data: { txid: txidTrim },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return { success: true, billPayment: updated };
}

export async function listUserBillPayments(userId: string, options?: { status?: string; page?: number; limit?: number }) {
  const page = options?.page ?? 1;
  const limit = Math.min(options?.limit ?? 20, 50);
  const skip = (page - 1) * limit;
  const where: any = { userId };
  if (options?.status) where.status = options.status;

  const [items, total] = await Promise.all([
    db.billPayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true, barcode: true, digitableLine: true, amount: true, fee: true,
        totalAmount: true, walletAddress: true, status: true, txid: true,
        receiptUrl: true, couponUsed: true,
        createdAt: true, paidAt: true,
      },
    }),
    db.billPayment.count({ where }),
  ]);

  return { billPayments: items, total, page, limit };
}

export async function getBillPaymentById(billPaymentId: string, userId: string) {
  return db.billPayment.findFirst({
    where: { id: billPaymentId, userId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function adminListBillPayments(options?: { status?: string; page?: number; limit?: number }) {
  const page = options?.page ?? 1;
  const limit = Math.min(options?.limit ?? 50, 100);
  const skip = (page - 1) * limit;
  const where: any = {};
  if (options?.status) where.status = options.status;

  const [items, total] = await Promise.all([
    db.billPayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { user: { select: { id: true, name: true, email: true, telegram: true } } },
    }),
    db.billPayment.count({ where }),
  ]);

  return { billPayments: items, total, page, limit };
}

export async function finalizeApprovedBillPayment(
  billPaymentId: string,
): Promise<{ success: boolean; error?: string; billPayment?: any }> {
  const bp = await db.billPayment.findUnique({
    where: { id: billPaymentId },
    include: { user: { select: { id: true, name: true, email: true, telegram: true } } },
  });
  if (!bp) return { success: false, error: 'Pagamento não encontrado.' };

  let referralNotification: { earnerId: string; commission: number } | null = null;

  try {
    await db.$transaction(async (tx: any) => {
      const claimed = await tx.billPayment.updateMany({
        where: { id: billPaymentId, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'PAID', paidAt: new Date() },
      });
      if (claimed.count === 0) throw new Error('BILL_ALREADY_FINALIZED');

      await tx.user.update({
        where: { id: bp.userId },
        data: { totalPaid: { increment: bp.totalAmount } },
      });

      const owner = await tx.user.findUnique({ where: { id: bp.userId }, select: { referredByCode: true } });
      if (owner?.referredByCode) {
        const referrer = await tx.user.findUnique({ where: { referralCode: owner.referredByCode }, select: { id: true } });
        if (referrer) {
          const referralCommission = Math.floor(Number(bp.fee) * REFERRAL_RATE * 100) / 100;
          await tx.referralEarning.create({
            data: {
              earnerId: referrer.id,
              sourceUserId: bp.userId,
              billPaymentId: bp.id,
              feeAmount: Number(bp.fee),
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

      if (bp.affiliateId) {
        const cost = costForAmount(Number(bp.amount));
        const profit = Math.max(0, Number(bp.fee) - cost);
        const commissionAmount = Math.floor(profit * 0.20 * 100) / 100;
        if (commissionAmount > 0) {
          const existing = await tx.affiliateTransaction.findFirst({
            where: { affiliateId: bp.affiliateId, billPaymentId: bp.id },
          });
          if (!existing) {
            await tx.affiliateTransaction.create({
              data: {
                affiliateId: bp.affiliateId,
                billPaymentId: bp.id,
                amount: Number(bp.totalAmount),
                commission: commissionAmount,
                status: 'AVAILABLE',
                availableAt: new Date(),
              },
            });
            await tx.affiliate.update({
              where: { id: bp.affiliateId },
              data: { balance: { increment: commissionAmount }, totalEarned: { increment: commissionAmount } },
            });
          }
        }
      }

      if (bp.couponId) {
        await tx.coupon.update({
          where: { id: bp.couponId },
          data: { usageCount: { increment: 1 } },
        });
        await tx.couponUsage.create({
          data: {
            couponId: bp.couponId,
            userId: bp.userId,
            userEmail: bp.user?.email ?? '',
            userTelegram: bp.user?.telegram ?? '',
            userIp: bp.userIp ?? '',
            billPaymentId: bp.id,
          },
        });
      }
    }, { isolationLevel: 'Serializable', timeout: 10000 });
  } catch (err: any) {
    if (err?.message === 'BILL_ALREADY_FINALIZED') return { success: false, error: 'Pagamento já finalizado.' };
    throw err;
  }

  const updated = await db.billPayment.findUnique({
    where: { id: billPaymentId },
    include: { user: { select: { id: true, name: true, email: true, telegram: true } } },
  });

  const notif = referralNotification as { earnerId: string; commission: number } | null;
  if (notif) {
    try { const { notifyAffiliateCommission } = require('./push.service'); notifyAffiliateCommission(notif.earnerId, notif.commission).catch(() => {}); } catch (_e) {}
    try { const { notifyUserByTelegram } = require('./telegram.service'); notifyUserByTelegram(notif.earnerId, `🎉 Nova comissão de indicação!\n\nVocê ganhou R$ ${notif.commission.toFixed(2)} pela aprovação de um pagamento de conta do seu indicado.`).catch(() => {}); } catch (_e) {}
  }

  try {
    const { notifyUserByTelegram } = require('./telegram.service');
    const valor = Number(bp.totalAmount ?? bp.amount ?? 0).toFixed(2).replace('.', ',');
    notifyUserByTelegram(bp.userId, `✅ PagDepix pagou sua conta!\nValor: R$ ${valor}`).catch(() => {});
  } catch (_e) {}

  return { success: true, billPayment: updated };
}

export async function adminApproveBillPayment(
  billPaymentId: string,
): Promise<{ success: boolean; error?: string; billPayment?: any }> {
  const bp = await db.billPayment.findUnique({ where: { id: billPaymentId } });
  if (!bp) return { success: false, error: 'Pagamento não encontrado.' };
  if (bp.status === 'PAID') return { success: false, error: 'Pagamento já está pago.' };
  if (bp.status === 'PROCESSING') return { success: false, error: 'Pagamento já está sendo processado.' };
  if (bp.status === 'CANCELLED') return { success: false, error: 'Pagamento foi cancelado.' };

  return finalizeApprovedBillPayment(billPaymentId);
}

export async function adminRejectBillPayment(
  billPaymentId: string,
): Promise<{ success: boolean; error?: string; billPayment?: any }> {
  const bp = await db.billPayment.findUnique({ where: { id: billPaymentId } });
  if (!bp) return { success: false, error: 'Pagamento não encontrado.' };
  if (bp.status === 'PAID') return { success: false, error: 'Pagamento já está pago.' };
  if (bp.status === 'CANCELLED') return { success: false, error: 'Pagamento já foi cancelado.' };

  const updated = await db.billPayment.update({
    where: { id: billPaymentId },
    data: { status: 'CANCELLED' },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return { success: true, billPayment: updated };
}
