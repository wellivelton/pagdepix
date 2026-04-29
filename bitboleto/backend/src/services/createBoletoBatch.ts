import { prisma } from '../prisma';
import {
  calculateTax,
  getTaxRule,
  getMaxCouponDiscountFromRule,
  getAffiliateCommissionFromProfit,
  MIN_BOLETO_AMOUNT,
  REFERRAL_RATE,
} from '../utils/taxConfig';
import {
  isUserVerified,
  validateCouponUsage,
  logCouponUsage,
  calculateEstimatedProfit,
} from '../utils/antifraud';
import { getRates, convertBrlToUsdt, convertBrlToSats } from './exchangeRate';

// ─── types ────────────────────────────────────────────────────────────────────

export interface BatchItemInput {
  barcode?: string;
  pdfUrl?: string;
  pdfPassword?: string;
  amount: number;
  dueDate: Date;
}

export interface CreateBoletoBatchInput {
  userId: string;
  items: BatchItemInput[];
  couponCode?: string;
  paymentCurrency?: 'DEPIX' | 'USDT' | 'BTC';
}

export interface CreateBoletoBatchResult {
  success: boolean;
  batch?: any;
  error?: string;
}

// ─── wallet config (shared with createBoleto) ────────────────────────────────

interface WalletConfig {
  walletAddress: string;
  qrCodeUrl: string;
  walletAddressUsdt: string | null;
  qrCodeUrlUsdt: string | null;
  walletAddressBtc: string | null;
  qrCodeUrlBtc: string | null;
  rateLockMinutes: number;
}

const getWalletConfig = async (): Promise<WalletConfig> => {
  const defaultAddr = process.env.LIQUID_WALLET_ADDRESS || '';
  try {
    const config = await prisma.config.findUnique({ where: { id: 'config' } });
    if (config) {
      return {
        walletAddress: config.walletAddress,
        qrCodeUrl: config.qrCodeUrl,
        walletAddressUsdt: config.walletAddressUsdt,
        qrCodeUrlUsdt: config.qrCodeUrlUsdt,
        walletAddressBtc: config.walletAddressBtc,
        qrCodeUrlBtc: config.qrCodeUrlBtc,
        rateLockMinutes: config.rateLockMinutes,
      };
    }
    return { walletAddress: defaultAddr, qrCodeUrl: '/qr-code.png', walletAddressUsdt: null, qrCodeUrlUsdt: null, walletAddressBtc: null, qrCodeUrlBtc: null, rateLockMinutes: 10 };
  } catch {
    return { walletAddress: defaultAddr, qrCodeUrl: '/qr-code.png', walletAddressUsdt: null, qrCodeUrlUsdt: null, walletAddressBtc: null, qrCodeUrlBtc: null, rateLockMinutes: 10 };
  }
};

function pickWallet(config: WalletConfig, currency: string) {
  if (currency === 'USDT') {
    if (!config.walletAddressUsdt) throw new Error('Carteira USDT não configurada.');
    return { walletAddress: config.walletAddressUsdt, qrCodeUrl: config.qrCodeUrlUsdt || '' };
  }
  if (currency === 'BTC') {
    if (!config.walletAddressBtc) throw new Error('Carteira Bitcoin não configurada.');
    return { walletAddress: config.walletAddressBtc, qrCodeUrl: config.qrCodeUrlBtc || '' };
  }
  return { walletAddress: config.walletAddress, qrCodeUrl: config.qrCodeUrl };
}

// ─── main service ─────────────────────────────────────────────────────────────

export const createBoletoBatch = async (
  input: CreateBoletoBatchInput,
  req?: any,
): Promise<CreateBoletoBatchResult> => {
  const { userId, items, couponCode, paymentCurrency: currency = 'DEPIX' } = input;
  const userIp = req?.ip || req?.socket?.remoteAddress || 'unknown';
  const deviceFingerprint = req?.deviceFingerprint || undefined;

  // ── 1. Validações básicas ────────────────────────────────────────────────

  if (!items || items.length === 0)
    return { success: false, error: 'Nenhum boleto informado.' };

  if (items.length > 5)
    return { success: false, error: 'Máximo de 5 boletos por lote.' };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: 'Usuário não encontrado.' };
  if (user.isBlocked) return { success: false, error: 'Usuário bloqueado.' };
  if (!user.isActive) return { success: false, error: 'Usuário inativo.' };

  // ── 2. Validar cada item individualmente ────────────────────────────────

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const label = `Boleto ${i + 1}`;
    if (it.amount < MIN_BOLETO_AMOUNT)
      return { success: false, error: `${label}: valor mínimo é R$ ${MIN_BOLETO_AMOUNT.toFixed(2)}.` };
    if (!it.barcode && !it.pdfUrl)
      return { success: false, error: `${label}: informe o código de barras ou PDF.` };
    if (new Date(it.dueDate) < hoje)
      return { success: false, error: `${label}: boleto vencido.` };
  }

  // ── 3. Processar cupom (uma única vez, aplica a todos os itens) ──────────

  let descontoAplicado = 0;
  let cupom: any = null;
  let affiliateId: string | null = null;
  let isReferralDiscount = false;

  if (couponCode) {
    const verified = await isUserVerified(userId);
    if (!verified)
      return { success: false, error: 'Verifique seu email e Telegram antes de usar cupons.' };

    cupom = await prisma.coupon.findUnique({
      where: { code: couponCode.toUpperCase() },
      include: { affiliate: { include: { user: { select: { id: true, email: true, telegram: true } } } } },
    });
    if (!cupom) return { success: false, error: 'Cupom inválido.' };
    if (!cupom.isActive) return { success: false, error: 'Cupom inativo.' };
    if (cupom.maxUsage !== null && cupom.usageCount >= cupom.maxUsage)
      return { success: false, error: 'Cupom esgotado.' };

    // Validação antifraude usando o primeiro item como referência
    const couponValidation = await validateCouponUsage(
      couponCode, userId, user.email, user.telegram, userIp, deviceFingerprint, items[0].amount,
    );
    if (!couponValidation.valid)
      return { success: false, error: couponValidation.reason || 'Cupom inválido.' };

    const taxRuleForCap = getTaxRule(items[0].amount);
    const maxDiscount = taxRuleForCap ? getMaxCouponDiscountFromRule(taxRuleForCap) : 0;
    descontoAplicado = Math.min(cupom.discount, maxDiscount);
    affiliateId = cupom.affiliateId;
  } else {
    // Desconto de indicação (referral) — automático
    const userReferral = await prisma.user.findUnique({ where: { id: userId }, select: { referredByCode: true } });
    if (userReferral?.referredByCode) {
      isReferralDiscount = true;
      // Desconto de 20% será aplicado diretamente sobre cada taxa (sem passar pelo cap do cupom)
    }
  }

  // ── 4. Calcular taxas de cada item ──────────────────────────────────────

  interface ItemCalc {
    item: BatchItemInput;
    amount: number;
    fee: number;
    totalAmount: number;
    affiliateCommission: number;
    profitValid: boolean;
    profitError?: string;
  }

  const calcs: ItemCalc[] = [];
  let grandTotalBoletos = 0;
  let grandTotalFee = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const taxCalc = calculateTax(it.amount, descontoAplicado);
    if (!taxCalc.isValid)
      return { success: false, error: `Boleto ${i + 1}: valor inválido para cálculo de taxa.` };

    // Referral: aplica 20% de desconto diretamente sobre a taxa (sem cap do cupom)
    let fee = taxCalc.taxAmount;
    let totalAmount: number = taxCalc.totalAmountExact ?? taxCalc.totalAmount;

    if (isReferralDiscount) {
      const referralDiscountAmount = Math.floor(fee * REFERRAL_RATE * 100) / 100;
      fee = Math.round((fee - referralDiscountAmount) * 100) / 100;
      totalAmount = parseFloat((it.amount + fee).toFixed(2));
    }
    const affComm = affiliateId ? getAffiliateCommissionFromProfit(fee, it.amount) : 0;
    const profitCalc = calculateEstimatedProfit(it.amount, fee, affComm);

    if (!profitCalc.isValid)
      return { success: false, error: `Boleto ${i + 1}: margem insuficiente (lucro estimado: R$ ${profitCalc.profit.toFixed(2)}).` };

    calcs.push({ item: it, amount: it.amount, fee, totalAmount, affiliateCommission: affComm, profitValid: true });
    grandTotalBoletos += it.amount;
    grandTotalFee += fee;
  }

  const grandTotal = grandTotalBoletos + grandTotalFee;

  // ── 5. Conversão multi-moeda (sobre o total combinado) ──────────────────

  let exchangeRate: number | null = null;
  let cryptoAmount: string | null = null;
  let rateLockExpiresAt: Date | null = null;
  const walletConfig = await getWalletConfig();

  if (currency === 'USDT') {
    const rates = await getRates();
    exchangeRate = rates.usdBrl;
    cryptoAmount = convertBrlToUsdt(grandTotal, rates.usdBrl).toFixed(8);
    rateLockExpiresAt = new Date(Date.now() + walletConfig.rateLockMinutes * 60_000);
  } else if (currency === 'BTC') {
    const rates = await getRates();
    exchangeRate = rates.btcBrl;
    cryptoAmount = String(Math.round(convertBrlToSats(grandTotal, rates.btcBrl)));
    rateLockExpiresAt = new Date(Date.now() + walletConfig.rateLockMinutes * 60_000);
  }

  let wallet: { walletAddress: string; qrCodeUrl: string };
  try {
    wallet = pickWallet(walletConfig, currency);
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  // ── 6. Criar o batch e cada boleto numa transação ───────────────────────

  const batchAndBoletos = await prisma.$transaction(async (tx) => {
    // 6a. Criar o BoletoBatch
    const batch = await (tx as any).boletoBatch.create({
      data: {
        userId,
        itemCount: items.length,
        totalBoletos: grandTotalBoletos,
        totalFee: grandTotalFee,
        grandTotal,
        walletAddress: wallet.walletAddress,
        qrCode: wallet.qrCodeUrl,
        paymentCurrency: currency,
        cryptoAmount,
        depixAmount: grandTotal,
        exchangeRate,
        rateLockExpiresAt,
        couponCode: couponCode?.toUpperCase() || null,
        status: 'PENDING',
      },
    });

    // 6b. Criar cada boleto vinculado ao batch
    const boletosCreated = [];
    for (const calc of calcs) {
      const b = await tx.boleto.create({
        data: {
          userId,
          batchId: batch.id,
          barcode: calc.item.barcode || null,
          pdfUrl: calc.item.pdfUrl || null,
          pdfPassword: calc.item.pdfPassword || null,
          amount: calc.amount,
          fee: calc.fee,
          totalAmount: calc.totalAmount,
          dueDate: new Date(calc.item.dueDate),
          depixAmount: calc.totalAmount,
          walletAddress: wallet.walletAddress, // mesma carteira do batch
          qrCode: wallet.qrCodeUrl,
          status: 'PENDING',
          couponUsed: couponCode?.toUpperCase() || null,
          couponId: cupom?.id || null,
          affiliateId: affiliateId || null,
          paymentCurrency: currency,
          exchangeRate,
          cryptoAmount: null, // cada boleto não tem seu próprio crypto amount; usa o do batch
          rateLockExpiresAt,
        },
      });
      boletosCreated.push(b);
    }

    return { batch, boletos: boletosCreated };
  });

  const { batch, boletos } = batchAndBoletos;

  // ── 7. Registrar uso do cupom (uma vez por batch, não por boleto) ────────

  if (cupom && couponCode) {
    await logCouponUsage(
      cupom.id, userId, user.email, user.telegram, userIp, deviceFingerprint, boletos[0].id,
    );
  }

  // ── 8. Log ───────────────────────────────────────────────────────────────

  await prisma.log.create({
    data: {
      action: 'boleto_batch_created',
      details: JSON.stringify({
        batchId: batch.id,
        itemCount: items.length,
        grandTotal,
        couponCode: couponCode || null,
        currency,
        boletoIds: boletos.map((b: any) => b.id),
      }),
      ip: userIp,
      userAgent: req?.get?.('user-agent') || 'unknown',
      userId,
    },
  });

  // ── 9. Retornar ──────────────────────────────────────────────────────────

  return {
    success: true,
    batch: {
      id: batch.id,
      itemCount: batch.itemCount,
      totalBoletos: batch.totalBoletos,
      totalFee: batch.totalFee,
      grandTotal: batch.grandTotal,
      walletAddress: batch.walletAddress,
      qrCode: batch.qrCode,
      paymentCurrency: batch.paymentCurrency,
      cryptoAmount: batch.cryptoAmount,
      depixAmount: batch.depixAmount,
      exchangeRate: batch.exchangeRate,
      rateLockExpiresAt: batch.rateLockExpiresAt,
      status: batch.status,
      boletos: boletos.map((b: any) => ({
        id: b.id,
        barcode: b.barcode,
        pdfUrl: b.pdfUrl,
        amount: b.amount,
        fee: b.fee,
        totalAmount: b.totalAmount,
        dueDate: b.dueDate,
        status: b.status,
      })),
    },
  };
};
