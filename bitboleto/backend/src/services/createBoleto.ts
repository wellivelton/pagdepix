import { prisma } from '../prisma';
import { env } from '../config/env';

// ========================================
// TIPOS
// ========================================
interface CreateBoletoInput {
  userId: string;
  barcode?: string;
  pdfUrl?: string;
  pdfPassword?: string;
  amount: number;
  dueDate: Date;
  couponCode?: string;
  paymentCurrency?: 'DEPIX' | 'USDT' | 'BTC';
}

interface CreateBoletoResult {
  success: boolean;
  boleto?: any;
  error?: string;
}

// ========================================
// IMPORTS
// ========================================
import {
  calculateTax,
  getTaxRule,
  getMaxCouponDiscountFromRule,
  getAffiliateCommissionFromProfit,
  costForAmount,
  MIN_BOLETO_AMOUNT,
  REFERRAL_RATE,
} from '../utils/taxConfig';
import {
  isUserVerified,
  validateCouponUsage,
  calculateEstimatedProfit
} from '../utils/antifraud';

import { getRates, convertBrlToUsdt, convertBrlToSats } from './exchangeRate';
import { isXpubConfigured, getNextAddressIndex, deriveLiquidAddress } from './liquidHdWallet.service';

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
  const defaultAddr = env.LIQUID_WALLET_ADDRESS;
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
    const defaultConfig = await prisma.config.create({
      data: { id: 'config', walletAddress: defaultAddr, qrCodeUrl: '/qr-code.png' }
    });
    return {
      walletAddress: defaultConfig.walletAddress,
      qrCodeUrl: defaultConfig.qrCodeUrl,
      walletAddressUsdt: null, qrCodeUrlUsdt: null,
      walletAddressBtc: null, qrCodeUrlBtc: null,
      rateLockMinutes: 10,
    };
  } catch (error) {
    console.error('Erro ao buscar configurações da carteira:', error);
    return {
      walletAddress: defaultAddr, qrCodeUrl: '/qr-code.png',
      walletAddressUsdt: null, qrCodeUrlUsdt: null,
      walletAddressBtc: null, qrCodeUrlBtc: null,
      rateLockMinutes: 10,
    };
  }
};

function pickWallet(config: WalletConfig, currency: string) {
  if (currency === 'USDT') {
    if (!config.walletAddressUsdt) throw new Error('Carteira USDT não configurada. Entre em contato com o suporte.');
    return { walletAddress: config.walletAddressUsdt, qrCodeUrl: config.qrCodeUrlUsdt || '' };
  }
  if (currency === 'BTC') {
    if (!config.walletAddressBtc) throw new Error('Carteira Bitcoin não configurada. Entre em contato com o suporte.');
    return { walletAddress: config.walletAddressBtc, qrCodeUrl: config.qrCodeUrlBtc || '' };
  }
  return { walletAddress: config.walletAddress, qrCodeUrl: config.qrCodeUrl };
}

// ========================================
// CRIAR BOLETO
// ========================================
export const createBoleto = async (
  input: CreateBoletoInput,
  req?: any // Request object para obter IP e device fingerprint
): Promise<CreateBoletoResult> => {
  try {
    const { userId, barcode, pdfUrl, pdfPassword, amount, dueDate, couponCode, paymentCurrency: currency = 'DEPIX' } = input;
    
    // Obter IP e device fingerprint do request
    const userIp = req?.ip || req?.socket?.remoteAddress || 'unknown';
    const deviceFingerprint = req?.deviceFingerprint || undefined;

    // ========================================
    // 1. VALIDAÇÕES
    // ========================================
    
    // Validar usuário
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return { success: false, error: 'Usuário não encontrado' };
    }

    if (user.isBlocked) {
      return { success: false, error: 'Usuário bloqueado' };
    }

    if (!user.isActive) {
      return { success: false, error: 'Usuário inativo' };
    }

    // Validar valor mínimo do boleto
    if (amount < MIN_BOLETO_AMOUNT) {
      return { 
        success: false, 
        error: `Valor mínimo do boleto é R$ ${MIN_BOLETO_AMOUNT.toFixed(2)}` 
      };
    }

    // Validar data de vencimento
    const dataVencimento = new Date(dueDate);
    const hoje2 = new Date();
    hoje2.setHours(0, 0, 0, 0);

    if (dataVencimento < hoje2) {
      return { success: false, error: 'Boleto vencido' };
    }

    // ========================================
    // 2. PROCESSAR CUPOM (se houver) - COM VALIDAÇÕES ANTIFRAUDE
    // ========================================
    let cupom = null;
    let descontoAplicado = 0;
    let affiliateId = null;
    let affiliateCommission = 0;

    if (couponCode) {
      // Verificar se usuário está verificado (email e telegram)
      const verified = await isUserVerified(userId);
      if (!verified) {
        return { 
          success: false, 
          error: 'Você precisa verificar seu email e Telegram antes de usar cupons' 
        };
      }

      // Buscar cupom
      cupom = await prisma.coupon.findUnique({
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

      if (!cupom) {
        return { success: false, error: 'Cupom inválido' };
      }

      if (!cupom.isActive) {
        return { success: false, error: 'Cupom inativo' };
      }

      // Verificar se o cupom ainda pode ser usado (maxUsage)
      if (cupom.maxUsage !== null && cupom.usageCount >= cupom.maxUsage) {
        return { success: false, error: 'Cupom esgotado' };
      }

      // VALIDAÇÕES ANTIFRAUDE
      const couponValidation = await validateCouponUsage(
        couponCode,
        userId,
        user.email,
        user.telegram,
        userIp,
        deviceFingerprint,
        amount
      );

      if (!couponValidation.valid) {
        return { success: false, error: couponValidation.reason || 'Cupom inválido' };
      }

      const taxRuleForCap = getTaxRule(amount);
      const maxDiscount = taxRuleForCap ? getMaxCouponDiscountFromRule(taxRuleForCap) : 0;
      descontoAplicado = Math.min(cupom.discount, maxDiscount);
      affiliateId = cupom.affiliateId;
    }

    // ========================================
    // DESCONTO DE INDICAÇÃO (Referral)
    // Aplicado automaticamente se o usuário foi indicado e não usou cupom de afiliado
    // ========================================
    let isReferralDiscount = false;
    if (!couponCode) {
      const userReferral = await prisma.user.findUnique({
        where: { id: userId },
        select: { referredByCode: true }
      });
      if (userReferral?.referredByCode) {
        isReferralDiscount = true;
        // Desconto de 20% será aplicado diretamente sobre a taxa (sem passar pelo cap do cupom)
      }
    }

    // ========================================
    // 3. CALCULAR VALORES COM TAXAS INTELIGENTES
    // ========================================
    const taxRule = getTaxRule(amount);
    const taxCalculation = calculateTax(amount, descontoAplicado);

    if (!taxCalculation.isValid) {
      return { 
        success: false, 
        error: `Valor mínimo do boleto é R$ ${MIN_BOLETO_AMOUNT.toFixed(2)}` 
      };
    }

    // Referral: aplica 20% de desconto diretamente sobre a taxa (sem cap do cupom)
    let fee = taxCalculation.taxAmount;
    let totalAmount: number = taxCalculation.totalAmountExact ?? taxCalculation.totalAmount;

    if (isReferralDiscount) {
      const referralDiscountAmount = Math.floor(fee * REFERRAL_RATE * 100) / 100;
      fee = Math.round((fee - referralDiscountAmount) * 100) / 100;
      totalAmount = parseFloat((amount + fee).toFixed(2));
    }

    // Comissão do afiliado = 20% do lucro (taxa - custo), nunca sobre valor do boleto
    if (affiliateId) {
      affiliateCommission = getAffiliateCommissionFromProfit(fee, amount);
    }

    // ========================================
    // 2.5. CALCULAR LUCRO ESTIMADO (ANTIFRAUDE)
    // ========================================
    const profitCalculation = calculateEstimatedProfit(amount, fee, affiliateCommission);

    if (!profitCalculation.isValid) {
      return {
        success: false,
        error: `Margem insuficiente. Lucro estimado: R$ ${profitCalculation.profit.toFixed(2)}. Mínimo necessário: R$ 0,80`
      };
    }

    // ========================================
    // 3.5 CONVERSÃO MULTI-MOEDA
    // ========================================
    const depixAmount = totalAmount;
    let exchangeRate: number | null = null;
    let cryptoAmount: string | null = null;
    let rateLockExpiresAt: Date | null = null;

    const walletConfig = await getWalletConfig();

    if (currency === 'USDT') {
      const rates = await getRates();
      exchangeRate = rates.usdBrl;
      const usdtVal = convertBrlToUsdt(totalAmount, rates.usdBrl);
      cryptoAmount = usdtVal.toFixed(8);
      rateLockExpiresAt = new Date(Date.now() + walletConfig.rateLockMinutes * 60_000);
    } else if (currency === 'BTC') {
      const rates = await getRates();
      exchangeRate = rates.btcBrl;
      const sats = convertBrlToSats(totalAmount, rates.btcBrl);
      cryptoAmount = String(Math.round(sats));
      rateLockExpiresAt = new Date(Date.now() + walletConfig.rateLockMinutes * 60_000);
    }

    let wallet: { walletAddress: string; qrCodeUrl: string };
    let liquidAddressIndex: number | null = null;

    if (isXpubConfigured()) {
      try {
        liquidAddressIndex = await getNextAddressIndex(prisma);
        const hdAddress = deriveLiquidAddress(env.LIQUID_XPUB, env.LIQUID_MASTER_BLINDING_KEY, liquidAddressIndex);
        wallet = { walletAddress: hdAddress, qrCodeUrl: '' };
      } catch (err: any) {
        console.error('[createBoleto] HD derivation failed, falling back to static wallet:', err);
        liquidAddressIndex = null;
        try { wallet = pickWallet(walletConfig, currency); } catch (e: any) {
          return { success: false, error: e.message };
        }
      }
    } else {
      try {
        wallet = pickWallet(walletConfig, currency);
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    // ========================================
    // 4. CRIAR BOLETO NO BANCO (com $transaction + FOR UPDATE no cupom + retry P2002)
    // ========================================
    const boletoData: any = {
      userId,
      barcode: barcode || null,
      pdfUrl: pdfUrl || null,
      pdfPassword: pdfPassword || null,
      amount,
      fee,
      totalAmount,
      dueDate: dataVencimento,
      depixAmount,
      walletAddress: wallet.walletAddress,
      qrCode: wallet.qrCodeUrl,
      liquidAddressIndex,
      status: 'PENDING',
      couponUsed: couponCode?.toUpperCase() || null,
      couponId: cupom?.id || null,
      affiliateId: affiliateId || null,
      paymentCurrency: currency,
      exchangeRate,
      cryptoAmount,
      rateLockExpiresAt,
    };

    const MAX_INDEX_RETRIES = 3;
    let boleto: any;
    for (let attempt = 0; attempt <= MAX_INDEX_RETRIES; attempt++) {
      try {
        boleto = await prisma.$transaction(async (tx) => {
          // FOR UPDATE on coupon to prevent exhaustion race
          if (cupom) {
            const rows: any[] = await tx.$queryRaw`
              SELECT id, "usageCount", "maxUsage", "isActive"
              FROM "Coupon"
              WHERE id = ${cupom.id}
              FOR UPDATE
            `;
            const locked = rows[0];
            if (!locked?.isActive) throw new Error('COUPON_INACTIVE');
            if (locked.maxUsage != null && locked.usageCount >= locked.maxUsage) {
              throw new Error('COUPON_EXHAUSTED');
            }
          }

          const created = await tx.boleto.create({
            data: boletoData,
            include: {
              user: { select: { id: true, name: true, email: true, telegram: true } },
              coupon: true,
              affiliate: { select: { id: true, userId: true, couponCode: true } },
            },
          });

          // CouponUsage inside same tx (Q5: atomicity with boleto.create)
          if (cupom && couponCode) {
            await tx.couponUsage.create({
              data: {
                couponId: cupom.id,
                userId,
                userEmail: user.email.toLowerCase(),
                userTelegram: (user.telegram ?? '').toLowerCase(),
                userIp,
                deviceFingerprint: deviceFingerprint || null,
                boletoId: created.id,
              },
            });
          }

          return created;
        }, { timeout: 5000 });
        break; // success — exit retry loop
      } catch (err: any) {
        if (err?.message === 'COUPON_EXHAUSTED') return { success: false, error: 'Cupom esgotado.' };
        if (err?.message === 'COUPON_INACTIVE') return { success: false, error: 'Cupom inativo.' };
        if (err?.code === 'P2002' && liquidAddressIndex !== null && attempt < MAX_INDEX_RETRIES) {
          try {
            liquidAddressIndex = await getNextAddressIndex(prisma);
            const newAddr = deriveLiquidAddress(env.LIQUID_XPUB, env.LIQUID_MASTER_BLINDING_KEY, liquidAddressIndex);
            boletoData.walletAddress = newAddr;
            boletoData.liquidAddressIndex = liquidAddressIndex;
          } catch (_hdErr) {
            liquidAddressIndex = null;
            boletoData.liquidAddressIndex = null;
            try {
              const fallback = pickWallet(walletConfig, currency);
              boletoData.walletAddress = fallback.walletAddress;
              boletoData.qrCode = fallback.qrCodeUrl;
            } catch (wErr: any) {
              return { success: false, error: wErr.message };
            }
          }
          continue;
        }
        throw err;
      }
    }

    // ========================================
    // 7. REGISTRAR LOG (fora da tx — não crítico)
    // ========================================
    await prisma.log.create({
      data: {
        action: 'boleto_created',
        details: JSON.stringify({
          boletoId: boleto.id,
          amount: boleto.amount,
          fee: boleto.fee,
          totalAmount: boleto.totalAmount,
          couponUsed: couponCode || null
        }),
        ip: 'system',
        userAgent: 'backend',
        userId
      }
    });

    // ========================================
    // 9. RETORNAR BOLETO
    // ========================================
    return {
      success: true,
      boleto: {
        id: boleto.id,
        amount: boleto.amount,
        fee: boleto.fee,
        totalAmount: boleto.totalAmount,
        dueDate: boleto.dueDate,
        depixAmount: boleto.depixAmount,
        walletAddress: boleto.walletAddress,
        qrCode: boleto.qrCode,
        status: boleto.status,
        createdAt: boleto.createdAt,
        taxaAplicada: (taxCalculation.percentage * 100).toFixed(2).replace('.', ',') + '%',
        taxaFixa: taxCalculation.fixedFee,
        descontoAplicado: descontoAplicado > 0
          ? (descontoAplicado * 100).toFixed(2).replace('.', ',') + '%'
          : isReferralDiscount
            ? `${(REFERRAL_RATE * 100).toFixed(2).replace('.', ',')}%`
            : null,
        couponUsed: boleto.couponUsed,
        user: (boleto as any).user,
        paymentCurrency: (boleto as any).paymentCurrency,
        exchangeRate: (boleto as any).exchangeRate,
        cryptoAmount: (boleto as any).cryptoAmount,
        rateLockExpiresAt: (boleto as any).rateLockExpiresAt,
      }
    };

  } catch (error) {
    console.error('Erro ao criar boleto:', error);
    return { 
      success: false, 
      error: 'Erro interno ao criar boleto' 
    };
  }
};

// ========================================
// BUSCAR BOLETO POR ID
// ========================================
export const getBoletoById = async (boletoId: string, userId?: string) => {
  try {
    const where: any = { id: boletoId };
    
    // Se userId fornecido, garantir que o boleto pertence ao usuário
    if (userId) {
      where.userId = userId;
    }

    const boleto = await prisma.boleto.findFirst({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegram: true
          }
        },
        coupon: true,
        affiliate: {
          select: {
            id: true,
            couponCode: true
          }
        }
      }
    });

    return boleto;

  } catch (error) {
    console.error('Erro ao buscar boleto:', error);
    return null;
  }
};

// ========================================
// LISTAR BOLETOS DO USUÁRIO
// ========================================
export const listUserBoletos = async (userId: string, filters?: {
  status?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}) => {
  try {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [boletos, total] = await Promise.all([
      prisma.boleto.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          coupon: true
        }
      }),
      prisma.boleto.count({ where })
    ]);

    return {
      boletos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };

  } catch (error) {
    console.error('Erro ao listar boletos:', error);
    return null;
  }
};

// ========================================
// CALCULAR TAXA PREVIEW (sem criar boleto)
// ========================================
export const calculateFee = (amount: number, couponCode?: string, userId?: string, paymentCurrency?: string) => {
  return new Promise(async (resolve) => {
    try {
      if (amount < MIN_BOLETO_AMOUNT) {
        resolve({
          isValid: false,
          error: `Valor mínimo do boleto é R$ ${MIN_BOLETO_AMOUNT.toFixed(2)}`
        });
        return;
      }

      const taxRule = getTaxRule(amount);
      let descontoAplicado = 0;
      let cupomValido = false;

      if (couponCode && userId) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, telegram: true }
          });
          
          if (user) {
            // Validação completa de antifraude (igual à criação real)
            const validation = await validateCouponUsage(
              couponCode,
              userId,
              user.email || '',
              user.telegram || '',
              'unknown', // IP não disponível no preview
              undefined, // device fingerprint não disponível no preview
              amount,
              40 // mínimo para boleto
            );
            
            if (validation.valid) {
              const cupom = await prisma.coupon.findUnique({
                where: { code: couponCode.toUpperCase() }
              });
              
              const cupomDisponivel = cupom?.isActive && (cupom.maxUsage == null || cupom.usageCount < cupom.maxUsage);
              const usuarioPodeUsarCupom = await isUserVerified(userId);
              
              if (cupom && cupomDisponivel && taxRule && usuarioPodeUsarCupom) {
                const maxDiscount = getMaxCouponDiscountFromRule(taxRule);
                descontoAplicado = Math.min(cupom.discount, maxDiscount);
                cupomValido = true;
              }
            }
          }
        } catch (err) {
          console.error('[calculateFee] Erro ao validar cupom:', err);
          // Não bloquear preview, apenas não aplicar desconto
        }
      }

      // Aplicar desconto de indicação no preview se nenhum cupom foi informado
      let isReferralPreview = false;
      if (!couponCode && userId && descontoAplicado === 0) {
        try {
          const userRef = await prisma.user.findUnique({
            where: { id: userId },
            select: { referredByCode: true }
          });
          if (userRef?.referredByCode) {
            isReferralPreview = true;
            // Desconto de 20% será aplicado diretamente sobre a taxa (sem passar pelo cap do cupom)
          }
        } catch { /* não bloquear preview */ }
      }

      const taxCalculation = calculateTax(amount, descontoAplicado);

      if (!taxCalculation.isValid) {
        resolve({
          isValid: false,
          error: `Valor mínimo do boleto é R$ ${MIN_BOLETO_AMOUNT.toFixed(2)}`
        });
        return;
      }

      // Referral: aplica 20% de desconto diretamente sobre a taxa (sem cap do cupom)
      let previewFee = taxCalculation.taxAmount;
      let previewTotalExact: number = taxCalculation.totalAmountExact ?? taxCalculation.totalAmount;
      let referralDiscountAmount = 0;

      if (isReferralPreview) {
        referralDiscountAmount = Math.floor(previewFee * REFERRAL_RATE * 100) / 100;
        previewFee = Math.round((previewFee - referralDiscountAmount) * 100) / 100;
        previewTotalExact = parseFloat((amount + previewFee).toFixed(2));
      }

      const totalExact = previewTotalExact;
      const depixAmount = totalExact;
      const cur = (paymentCurrency || 'DEPIX').toUpperCase();

      let exchangeRateVal: number | null = null;
      let cryptoAmountVal: string | null = null;

      if (cur === 'USDT' || cur === 'BTC') {
        try {
          const rates = await getRates();
          if (cur === 'USDT') {
            exchangeRateVal = rates.usdBrl;
            cryptoAmountVal = convertBrlToUsdt(totalExact, rates.usdBrl).toFixed(8);
          } else {
            exchangeRateVal = rates.btcBrl;
            cryptoAmountVal = String(Math.round(convertBrlToSats(totalExact, rates.btcBrl)));
          }
        } catch {
          // cotação indisponível não bloqueia preview
        }
      }

      resolve({
        isValid: true,
        amount,
        taxRule: taxCalculation.taxRule,
        percentage: taxCalculation.percentage,
        percentageFormatted: (taxCalculation.percentage * 100).toFixed(2).replace('.', ',') + '%',
        fixedFee: taxCalculation.fixedFee,
        descontoAplicado: cupomValido
          ? (descontoAplicado * 100).toFixed(2).replace('.', ',') + '%'
          : isReferralPreview
            ? `${(REFERRAL_RATE * 100).toFixed(2).replace('.', ',')}%`
            : null,
        isReferralDiscount: isReferralPreview,
        fee: previewFee,
        totalAmount: parseFloat(totalExact.toFixed(2)),
        totalAmountExact: totalExact,
        depixAmount: totalExact,
        feeBeforeCoupon: taxCalculation.feeBeforeCoupon,
        totalBeforeDiscount: taxCalculation.totalBeforeDiscount,
        discountAmount: isReferralPreview ? referralDiscountAmount : taxCalculation.discountAmount,
        cupomValido,
        paymentCurrency: cur,
        exchangeRate: exchangeRateVal,
        cryptoAmount: cryptoAmountVal,
      });

    } catch (error) {
      console.error('Erro ao calcular taxa:', error);
      resolve({
        isValid: false,
        error: 'Erro ao calcular taxa'
      });
    }
  });
};