import { prisma } from '../prisma';
import { validateCouponUsage, isUserVerified } from '../utils/antifraud';
import { getSafeErrorMessage } from '../utils/safeError';
import { getRates, convertBrlToUsdt, convertBrlToSats } from './exchangeRate';
import { calculatePixCopiaColaFee, MIN_PIX_COPIA_COLA_AMOUNT, REFERRAL_RATE } from '../utils/taxConfig';
import { notifyAdmin, notifyUserByTelegram } from './telegram.service';
import { sendNotification } from './push.service';
import { dispatchWebhook } from './webhookService';

// ========================================
// TYPES
// ========================================
export interface CreatePixCopiaColaInput {
  userId: string;
  codigoPix: string;
  valorOriginal: number;
  nomeDestinatario: string;
  contatoTelegram?: string;
  contatoEmail?: string;
  contatoWhatsApp?: string;
  couponCode?: string;
  paymentCurrency?: 'DEPIX' | 'USDT' | 'BTC';
  apiKeyId?: string;
  affiliateId?: string;
  externalRef?: string;
  isSandbox?: boolean;
  userIp?: string;
  deviceFingerprint?: string;
}

export interface CreatePixCopiaColaResult {
  success: boolean;
  pixCopiaCola?: any;
  error?: string;
}

// ========================================
// WALLET CONFIG (mesmo padrão do mobileRecharge)
// ========================================
interface WalletConfig {
  walletAddress: string;
  walletAddressUsdt: string | null;
  walletAddressBtc: string | null;
  rateLockMinutes: number;
}

async function getWalletConfig(): Promise<WalletConfig> {
  const fallback = process.env.LIQUID_WALLET_ADDRESS || 'lq1qqgskhge4cunhw32799ky9wlaavt83xu0klvvz78yg4ugzr3dmq2t0gm4gyfdr59yhaq7anhkg52ha666d0nkys56jh979wyp7';
  try {
    const config = await prisma.config.findUnique({ where: { id: 'config' } });
    if (config?.walletAddress) return {
      walletAddress: config.walletAddress,
      walletAddressUsdt: config.walletAddressUsdt ?? null,
      walletAddressBtc: config.walletAddressBtc ?? null,
      rateLockMinutes: config.rateLockMinutes ?? 10,
    };
    return { walletAddress: fallback, walletAddressUsdt: null, walletAddressBtc: null, rateLockMinutes: 10 };
  } catch {
    return { walletAddress: fallback, walletAddressUsdt: null, walletAddressBtc: null, rateLockMinutes: 10 };
  }
}

function pickWallet(config: WalletConfig, currency: string): string {
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

// ========================================
// CALCULATE (PREVIEW)
// ========================================
export async function calculatePixCopiaColaFeeWithCoupon(
  valorOriginal: number,
  options: {
    couponCode?: string;
    userId?: string;
    userIp?: string;
    deviceFingerprint?: string;
    paymentCurrency?: string;
  }
): Promise<{
  isValid: boolean;
  error?: string;
  taxa?: number;
  valorTaxa?: number;
  totalFinal?: number;
  cupomValido?: boolean;
  descontoAplicado?: string;
  paymentCurrency?: string;
  exchangeRate?: number | null;
  cryptoAmount?: string | null;
}> {
  if (!Number.isFinite(valorOriginal) || valorOriginal < MIN_PIX_COPIA_COLA_AMOUNT) {
    return { isValid: false, error: `Valor mínimo para Pix Copia e Cola: R$ ${MIN_PIX_COPIA_COLA_AMOUNT.toFixed(2).replace('.', ',')}.` };
  }

  let couponDiscountFraction = 0;
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

    const cupom = await prisma.coupon.findUnique({ where: { code: options.couponCode.toUpperCase() } });
    const disponivel = cupom?.isActive && (cupom.maxUsage == null || cupom.usageCount < cupom.maxUsage);

    if (cupom && disponivel) {
      const validation = await validateCouponUsage(
        options.couponCode,
        options.userId,
        user.email,
        user.telegram,
        options.userIp ?? '',
        options.deviceFingerprint,
        valorOriginal,
        MIN_PIX_COPIA_COLA_AMOUNT
      );
      if (validation.valid) {
        couponDiscountFraction = Math.min(Math.max(0, Number(cupom.discount)), 1);
        cupomValido = true;
        descontoAplicado = `${(couponDiscountFraction * 100).toFixed(2).replace('.', ',')}%`;
      }
    }
  }

  const { taxa, valorTaxa, totalFinal } = calculatePixCopiaColaFee(valorOriginal, couponDiscountFraction);
  const cur = (options.paymentCurrency || 'DEPIX').toUpperCase();

  let exchangeRate: number | null = null;
  let cryptoAmount: string | null = null;

  if (cur === 'USDT' || cur === 'BTC') {
    try {
      const rates = await getRates();
      if (cur === 'USDT') {
        exchangeRate = rates.usdBrl;
        cryptoAmount = convertBrlToUsdt(totalFinal, rates.usdBrl).toFixed(2);
      } else {
        exchangeRate = rates.btcBrl;
        cryptoAmount = String(convertBrlToSats(totalFinal, rates.btcBrl));
      }
    } catch { /* cotação indisponível não bloqueia preview */ }
  }

  return {
    isValid: true,
    taxa,
    valorTaxa,
    totalFinal,
    cupomValido,
    descontoAplicado: cupomValido ? descontoAplicado : undefined,
    paymentCurrency: cur,
    exchangeRate,
    cryptoAmount,
  };
}

// ========================================
// CREATE
// ========================================
export async function createPixCopiaCola(input: CreatePixCopiaColaInput): Promise<CreatePixCopiaColaResult> {
  try {
    const {
      userId,
      codigoPix,
      valorOriginal,
      nomeDestinatario,
      contatoTelegram,
      contatoEmail,
      contatoWhatsApp,
      couponCode,
      paymentCurrency: currency = 'DEPIX',
      apiKeyId,
      affiliateId: inputAffiliateId,
      externalRef,
      isSandbox = false,
      userIp,
      deviceFingerprint,
    } = input;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: 'Usuário não encontrado.' };
    if (user.isBlocked || !user.isActive) return { success: false, error: 'Conta indisponível. Entre em contato com o suporte.' };

    const numValor = Number(valorOriginal);
    if (!Number.isFinite(numValor) || numValor < MIN_PIX_COPIA_COLA_AMOUNT) {
      return { success: false, error: `Valor mínimo: R$ ${MIN_PIX_COPIA_COLA_AMOUNT.toFixed(2).replace('.', ',')}.` };
    }

    const codigoPixTrim = String(codigoPix).trim();
    if (!codigoPixTrim) return { success: false, error: 'Código Pix é obrigatório.' };

    const nomeDestinatarioTrim = String(nomeDestinatario).trim();
    if (!nomeDestinatarioTrim) return { success: false, error: 'Nome do destinatário é obrigatório.' };

    const temContato = !!(contatoTelegram?.trim() || contatoEmail?.trim() || contatoWhatsApp?.trim());
    if (!temContato) return { success: false, error: 'Informe pelo menos um contato (Telegram, e-mail ou WhatsApp).' };

    let couponDiscountFraction = 0;
    let couponId: string | null = null;
    let couponUsed: string | null = null;
    let affiliateId: string | null = inputAffiliateId ?? null;

    if (couponCode) {
      const calc = await calculatePixCopiaColaFeeWithCoupon(numValor, {
        couponCode,
        userId,
        userIp,
        deviceFingerprint,
      });
      if (!calc.isValid) return { success: false, error: calc.error };
      if (calc.cupomValido) {
        const cupom = await prisma.coupon.findUnique({
          where: { code: couponCode.toUpperCase() },
          include: { affiliate: true }
        });
        if (cupom) {
          couponDiscountFraction = Math.min(Math.max(0, Number(cupom.discount)), 1);
          couponId = cupom.id;
          couponUsed = couponCode.toUpperCase();
          if (!affiliateId && cupom.affiliateId) affiliateId = cupom.affiliateId;
        }
      }
    }

    const { taxa, valorTaxa, totalFinal } = calculatePixCopiaColaFee(numValor, couponDiscountFraction);

    const walletConfig = await getWalletConfig();
    let walletAddress: string;
    try {
      walletAddress = pickWallet(walletConfig, currency);
    } catch (err: any) {
      return { success: false, error: err.message };
    }

    let exchangeRate: number | null = null;
    let cryptoAmount: string | null = null;
    let rateLockExpiresAt: Date | null = null;

    if (currency === 'USDT') {
      const rates = await getRates();
      exchangeRate = rates.usdBrl;
      cryptoAmount = convertBrlToUsdt(totalFinal, rates.usdBrl).toFixed(2);
      rateLockExpiresAt = new Date(Date.now() + walletConfig.rateLockMinutes * 60_000);
    } else if (currency === 'BTC') {
      const rates = await getRates();
      exchangeRate = rates.btcBrl;
      cryptoAmount = String(convertBrlToSats(totalFinal, rates.btcBrl));
      rateLockExpiresAt = new Date(Date.now() + walletConfig.rateLockMinutes * 60_000);
    }

    const record = await (prisma as any).pixCopiaCola.create({
      data: {
        userId,
        codigoPix: codigoPixTrim,
        valorOriginal: numValor,
        taxa,
        valorTaxa,
        totalFinal,
        nomeDestinatario: nomeDestinatarioTrim,
        contatoTelegram: contatoTelegram?.trim() || null,
        contatoEmail: contatoEmail?.trim() || null,
        contatoWhatsApp: contatoWhatsApp?.trim() || null,
        cupomUsado: couponUsed,
        cupomId: couponId,
        paymentCurrency: currency,
        walletAddress,
        status: 'PENDING',
        affiliateId,
        apiKeyId: apiKeyId || null,
        externalRef: externalRef || null,
        isSandbox,
        exchangeRate,
        cryptoAmount,
        rateLockExpiresAt,
      },
      include: {
        user: { select: { id: true, name: true, email: true, telegram: true } }
      }
    });

    return { success: true, pixCopiaCola: record };
  } catch (e) {
    console.error('Erro ao criar Pix Copia e Cola:', e);
    return { success: false, error: getSafeErrorMessage(e, 'Erro ao criar solicitação. Tente novamente.') };
  }
}

// ========================================
// SUBMIT TXID
// ========================================
export async function submitPixCopiaColaTxid(
  id: string,
  userId: string,
  txid: string,
  comprovanteUrl?: string
): Promise<{ success: boolean; error?: string; pixCopiaCola?: any }> {
  const record = await (prisma as any).pixCopiaCola.findFirst({
    where: { id, userId }
  });
  if (!record) return { success: false, error: 'Solicitação não encontrada.' };
  if (record.status !== 'PENDING') {
    return { success: false, error: 'Só é possível informar TXID em solicitações aguardando pagamento.' };
  }

  const txidTrim = String(txid).trim();
  if (txidTrim.length < 10) return { success: false, error: 'TXID inválido (mínimo 10 caracteres).' };

  // Rate lock
  if (record.rateLockExpiresAt && new Date() > new Date(record.rateLockExpiresAt)) {
    await (prisma as any).pixCopiaCola.update({ where: { id }, data: { rateExpired: true } });
    return { success: false, error: 'Cotação expirada. Crie uma nova solicitação com cotação atualizada.' };
  }

  // Anti-replay cross-tabela
  const [existingBoleto, existingRecharge, existingPcc] = await Promise.all([
    prisma.boleto.findFirst({ where: { txid: txidTrim } }),
    prisma.mobileRecharge.findFirst({ where: { txid: txidTrim } }),
    (prisma as any).pixCopiaCola.findFirst({ where: { txid: txidTrim, id: { not: id } } }),
  ]);
  if (existingBoleto || existingRecharge || existingPcc) {
    return { success: false, error: 'Este TXID já foi utilizado em outra transação.' };
  }

  const updated = await (prisma as any).pixCopiaCola.update({
    where: { id },
    data: {
      txid: txidTrim,
      status: 'TXID_SUBMITTED',
      txidSubmittedAt: new Date(),
      ...(comprovanteUrl ? { comprovante: comprovanteUrl } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, telegram: true } }
    }
  });

  // Notificar admin com dados completos para processar
  try {
    const contatoInfo = record.contatoTelegram
      ? `Telegram: ${record.contatoTelegram}`
      : record.contatoEmail
        ? `E-mail: ${record.contatoEmail}`
        : `WhatsApp: ${record.contatoWhatsApp}`;

    const cupomInfo = record.cupomUsado ? `\nCupom: ${record.cupomUsado}` : '';
    const moedaInfo = record.paymentCurrency !== 'DEPIX'
      ? ` (${record.paymentCurrency}: ${record.cryptoAmount})`
      : '';

    await notifyAdmin(
      `💸 *Pix Copia e Cola — Pagamento a processar*\n` +
      `Valor: R$ ${record.valorOriginal.toFixed(2)} • Taxa: R$ ${record.valorTaxa.toFixed(2)} • Total: R$ ${record.totalFinal.toFixed(2)}${moedaInfo}\n` +
      `Destinatário: ${record.nomeDestinatario}\n` +
      `${contatoInfo}${cupomInfo}\n` +
      `TXID: \`${txidTrim}\`\n` +
      `Usuário: ${updated.user?.email ?? userId}\n` +
      `ID: \`${id}\``
    );
  } catch (err) {
    console.error('[PIX-COPIA-COLA] Erro ao notificar admin (txid):', err);
  }

  return { success: true, pixCopiaCola: updated };
}

// ========================================
// LIST (USER)
// ========================================
export async function listUserPixCopiaCola(
  userId: string,
  options?: { status?: string; page?: number; limit?: number }
) {
  const page = options?.page ?? 1;
  const limit = Math.min(options?.limit ?? 20, 50);
  const skip = (page - 1) * limit;
  const where: any = { userId };
  if (options?.status) where.status = options.status;

  const [items, total] = await Promise.all([
    (prisma as any).pixCopiaCola.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    (prisma as any).pixCopiaCola.count({ where })
  ]);

  return { items, total, page, limit };
}

// ========================================
// GET BY ID (USER)
// ========================================
export async function getPixCopiaColaById(id: string, userId: string) {
  return (prisma as any).pixCopiaCola.findFirst({
    where: { id, userId },
    include: { user: { select: { id: true, name: true, email: true, telegram: true } } }
  });
}

// ========================================
// ADMIN: LIST
// ========================================
export async function adminListPixCopiaCola(options?: { status?: string; page?: number; limit?: number }) {
  const page = options?.page ?? 1;
  const limit = Math.min(options?.limit ?? 50, 100);
  const skip = (page - 1) * limit;
  const where: any = {};
  if (options?.status && options.status !== 'ALL') where.status = options.status;

  const [items, total] = await Promise.all([
    (prisma as any).pixCopiaCola.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true, telegram: true } }
      }
    }),
    (prisma as any).pixCopiaCola.count({ where })
  ]);

  return { items, total, page, limit };
}

// ========================================
// ADMIN: PROCESS (APPROVE / REJECT)
// ========================================
export async function adminProcessPixCopiaCola(
  id: string,
  action: 'APPROVED' | 'REJECTED',
  adminNotes?: string,
  comprovanteAdminUrl?: string
): Promise<{ success: boolean; error?: string; pixCopiaCola?: any }> {
  const record = await (prisma as any).pixCopiaCola.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true, telegram: true, telegramChatId: true } } }
  });

  if (!record) return { success: false, error: 'Solicitação não encontrada.' };
  if (record.status !== 'TXID_SUBMITTED') {
    return { success: false, error: 'Só é possível processar solicitações com TXID informado.' };
  }

  const updated = await (prisma as any).pixCopiaCola.update({
    where: { id },
    data: {
      status: action,
      adminNotes: adminNotes?.trim() || null,
      processedAt: new Date(),
      ...(comprovanteAdminUrl ? { comprovante: comprovanteAdminUrl } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, telegram: true, telegramChatId: true } }
    }
  });

  if (action === 'APPROVED') {
    // Atualizar totalPaid do usuário
    await prisma.user.update({
      where: { id: record.userId },
      data: { totalPaid: { increment: record.totalFinal } }
    });

    // Comissão de indicação (referral)
    try {
      const owner = await prisma.user.findUnique({ where: { id: record.userId }, select: { referredByCode: true } });
      if (owner?.referredByCode) {
        const referrer = await prisma.user.findUnique({ where: { referralCode: owner.referredByCode }, select: { id: true } });
        if (referrer) {
          const referralCommission = Math.floor(record.valorTaxa * REFERRAL_RATE * 100) / 100;
          await (prisma as any).referralEarning.create({
            data: {
              earnerId: referrer.id,
              sourceUserId: record.userId,
              pixCopiaColaId: record.id,
              feeAmount: record.valorTaxa,
              commission: referralCommission,
            }
          });
          try { const { notifyAffiliateCommission } = require('./push.service'); notifyAffiliateCommission(referrer.id, referralCommission).catch(() => {}); } catch (_e) {}
          try { const { notifyUserByTelegram } = require('./telegram.service'); notifyUserByTelegram(referrer.id, `🎉 Nova comissão de indicação!\n\nVocê ganhou R$ ${referralCommission.toFixed(2)} pela aprovação de um Pix Copia e Cola do seu indicado.`).catch(() => {}); } catch (_e) {}
        }
      }
    } catch (err) {
      console.error('[PIX-COPIA-COLA] Erro ao criar comissão referral:', err);
    }

    // Comissão de afiliado
    if (record.affiliateId) {
      try {
        const existingTx = await prisma.affiliateTransaction.findFirst({
          where: { affiliateId: record.affiliateId, pixCopiaColaId: record.id }
        });

        if (!existingTx) {
          // Comissão: 1% do valor principal (split: afiliado 1%, plataforma 2%)
          const commissionAmount = Math.floor(record.valorOriginal * 0.01 * 100) / 100;

          if (commissionAmount > 0) {
            await prisma.affiliateTransaction.create({
              data: {
                affiliateId: record.affiliateId,
                pixCopiaColaId: record.id,
                amount: record.totalFinal,
                commission: commissionAmount,
                status: 'AVAILABLE',
                availableAt: new Date(),
              }
            });

            await prisma.affiliate.update({
              where: { id: record.affiliateId },
              data: {
                balance: { increment: commissionAmount },
                totalEarned: { increment: commissionAmount },
              }
            });
          }
        }

        // Incrementar usageCount do cupom
        if (record.cupomId) {
          await prisma.coupon.update({
            where: { id: record.cupomId },
            data: { usageCount: { increment: 1 } }
          });
        }
      } catch (err) {
        console.error('[PIX-COPIA-COLA] Erro ao criar comissão afiliado:', err);
      }
    }

    // Notificar usuário (push)
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://pagdepix.com';
      await sendNotification(record.userId, {
        title: '✅ Pix Copia e Cola aprovado!',
        body: `Seu pagamento de R$ ${record.totalFinal.toFixed(2).replace('.', ',')} foi aprovado.`,
        link: `${frontendUrl}/historico`,
        tag: 'pix-copia-cola-approved',
      });
    } catch (err) {
      console.error('[PIX-COPIA-COLA] Erro ao enviar push (aprovação):', err);
    }

    // Notificar usuário (Telegram)
    try {
      await notifyUserByTelegram(
        record.userId,
        `✅ *Pix Copia e Cola aprovado!*\n` +
        `Seu pagamento de R$ ${record.valorOriginal.toFixed(2)} foi processado.\n` +
        `Taxa: R$ ${record.valorTaxa.toFixed(2)} | Total pago: R$ ${record.totalFinal.toFixed(2)}\n` +
        `Destinatário: ${record.nomeDestinatario}`
      );
    } catch (err) {
      console.error('[PIX-COPIA-COLA] Erro ao notificar usuário (Telegram):', err);
    }

    // Webhook para afiliado (API)
    if (record.apiKeyId) {
      dispatchWebhook('pix.approved', record.id, 'pix-copia-cola', {
        valorOriginal: record.valorOriginal,
        valorTaxa: record.valorTaxa,
        totalFinal: record.totalFinal,
        nomeDestinatario: record.nomeDestinatario,
        paymentCurrency: record.paymentCurrency,
        txid: record.txid,
        status: 'APPROVED',
        externalRef: record.externalRef,
        processedAt: updated.processedAt,
      }, record.apiKeyId, record.isSandbox).catch(() => {});
    }
  } else {
    // REJECTED — notificar usuário
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://pagdepix.com';
      await sendNotification(record.userId, {
        title: '❌ Pix Copia e Cola reprovado',
        body: adminNotes
          ? `Seu pagamento foi reprovado: ${adminNotes}`
          : 'Seu pagamento foi reprovado. Entre em contato com o suporte.',
        link: `${frontendUrl}/historico`,
        tag: 'pix-copia-cola-rejected',
      });
    } catch (err) {
      console.error('[PIX-COPIA-COLA] Erro ao enviar push (reprovação):', err);
    }

    try {
      await notifyUserByTelegram(
        record.userId,
        `❌ *Pix Copia e Cola reprovado*\n` +
        (adminNotes ? `Motivo: ${adminNotes}\n` : '') +
        `Valor: R$ ${record.valorOriginal.toFixed(2)}\n` +
        `Entre em contato com o suporte para mais informações.`
      );
    } catch (err) {
      console.error('[PIX-COPIA-COLA] Erro ao notificar usuário rejeição (Telegram):', err);
    }

    // Webhook para afiliado (API)
    if (record.apiKeyId) {
      dispatchWebhook('pix.refused', record.id, 'pix-copia-cola', {
        valorOriginal: record.valorOriginal,
        valorTaxa: record.valorTaxa,
        totalFinal: record.totalFinal,
        nomeDestinatario: record.nomeDestinatario,
        paymentCurrency: record.paymentCurrency,
        txid: record.txid,
        status: 'REJECTED',
        adminNotes: adminNotes || null,
        externalRef: record.externalRef,
        processedAt: updated.processedAt,
      }, record.apiKeyId, record.isSandbox).catch(() => {});
    }
  }

  return { success: true, pixCopiaCola: updated };
}
