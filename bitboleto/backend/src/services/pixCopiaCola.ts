import { prisma } from '../prisma';
import { validateCouponUsage, isUserVerified } from '../utils/antifraud';
import { getSafeErrorMessage } from '../utils/safeError';
import { getRates, convertBrlToUsdt, convertBrlToSats } from './exchangeRate';
import { calculatePixCopiaColaFee, MIN_PIX_COPIA_COLA_AMOUNT, REFERRAL_RATE } from '../utils/taxConfig';
import { notifyAdmin, notifyUserByTelegram } from './telegram.service';
import { sendNotification } from './push.service';
import { dispatchWebhook } from './webhookService';
import { deriveLiquidAddress, getNextAddressIndex, isXpubConfigured, AUTO_MODE_CURRENCIES } from './liquidHdWallet.service';
import { env } from '../config/env';

// ========================================
// HELPERS
// ========================================

// Prisma returns Decimal objects for NUMERIC columns. Convert to plain numbers
// before sending in JSON responses so the frontend receives numeric types.
function serializePcc(record: any): any {
  if (!record) return record;
  return {
    ...record,
    valorOriginal: record.valorOriginal != null ? Number(record.valorOriginal) : record.valorOriginal,
    taxa:          record.taxa          != null ? Number(record.taxa)          : record.taxa,
    valorTaxa:     record.valorTaxa     != null ? Number(record.valorTaxa)     : record.valorTaxa,
    totalFinal:    record.totalFinal    != null ? Number(record.totalFinal)    : record.totalFinal,
    taxaFixa:      record.taxaFixa      != null ? Number(record.taxaFixa)      : record.taxaFixa,
    exchangeRate:  record.exchangeRate  != null ? Number(record.exchangeRate)  : record.exchangeRate,
  };
}

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
  autoMode?: boolean; // true = usa endereço xpub + detecção automática; false = fluxo manual
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
  const fallback = env.LIQUID_WALLET_ADDRESS;
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
  taxaFixa?: number;
  taxaVariavel?: number;
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

  const { taxa, taxaFixa, taxaVariavel, valorTaxa, totalFinal } = calculatePixCopiaColaFee(valorOriginal, couponDiscountFraction);
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
    taxaFixa,
    taxaVariavel,
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
      autoMode = true,
    } = input;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: 'Usuário não encontrado.' };
    if (user.isBlocked || !user.isActive) return { success: false, error: 'Conta indisponível. Entre em contato com o suporte.' };

    let numValor = Number(valorOriginal);
    if (!Number.isFinite(numValor) || numValor <= 0) {
      return { success: false, error: 'Valor inválido.' };
    }

    const codigoPixTrim = String(codigoPix).trim();
    if (!codigoPixTrim) return { success: false, error: 'Código Pix é obrigatório.' };

    console.log(`[PCC] create iniciado: userId=${userId} valor=${numValor} pixLen=${codigoPixTrim.length} pixPrefix=${codigoPixTrim.slice(0, 20)}...`);

    // ── SEGURANÇA CRÍTICA ──────────────────────────────────────────────────────
    // Decodificar o código Pix no backend é OBRIGATÓRIO.
    // O valor da Velora é a única fonte da verdade — nunca o input do usuário.
    // Isso impede o ataque de submeter PIX de R$5.000 com taxa calculada sobre R$20.
    const { veloraDecodePixCode } = await import('./velora.service');
    const pixDecoded = await veloraDecodePixCode(codigoPixTrim);
    console.log(`[PCC] decode resultado: success=${pixDecoded.success} amount=${pixDecoded.originalAmount} error=${pixDecoded.error}`);

    if (!pixDecoded.success) {
      console.error(`[PCC] veloraDecodePixCode falhou para userId=${userId}: ${pixDecoded.error}`);
      const veloraMsg = pixDecoded.error || 'Erro desconhecido';
      return {
        success: false,
        error: `Não foi possível validar o código Pix: ${veloraMsg}. Verifique se o código é correto e tente novamente.`,
      };
    }

    if (pixDecoded.originalAmount != null) {
      // QR code com valor fixo: Velora é a fonte da verdade
      const diff = Math.abs(pixDecoded.originalAmount - numValor);
      if (diff > 0.01) {
        console.warn(
          `[PCC] Amount mismatch: user submitted R$${numValor.toFixed(2)}, ` +
          `QR code is R$${pixDecoded.originalAmount.toFixed(2)} — rejecting.`
        );
        return {
          success: false,
          error: `Valor informado (R$ ${numValor.toFixed(2).replace('.', ',')}) não confere com o código Pix ` +
                 `(R$ ${pixDecoded.originalAmount.toFixed(2).replace('.', ',')}). O valor não pode ser alterado.`,
        };
      }
      // Usar o valor decodificado como autoritativo (elimina diferenças de float)
      numValor = pixDecoded.originalAmount;
    }
    // Se pixDecoded.originalAmount == null → PIX de valor aberto, usar valor do usuário
    // ──────────────────────────────────────────────────────────────────────────

    if (numValor < MIN_PIX_COPIA_COLA_AMOUNT) {
      return { success: false, error: `Valor mínimo: R$ ${MIN_PIX_COPIA_COLA_AMOUNT.toFixed(2).replace('.', ',')}. O código Pix informado é de R$ ${numValor.toFixed(2).replace('.', ',')}.` };
    }

    const MAX_PCC_AMOUNT = parseFloat(process.env.MAX_PCC_AMOUNT || '10000');
    if (numValor > MAX_PCC_AMOUNT) {
      return { success: false, error: `Valor máximo por pedido: R$ ${MAX_PCC_AMOUNT.toFixed(2).replace('.', ',')}. Entre em contato com o suporte para valores maiores.` };
    }

    const MAX_PENDING = parseInt(process.env.MAX_PCC_PENDING_PER_USER || '3', 10);
    const pendingCount = await (prisma as any).pixCopiaCola.count({
      where: { userId, status: 'PENDING' },
    });
    if (pendingCount >= MAX_PENDING) {
      return { success: false, error: `Você já possui ${pendingCount} pedido(s) pendente(s). Conclua os existentes antes de criar um novo.` };
    }

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

    const { taxa, taxaFixa, valorTaxa, totalFinal } = calculatePixCopiaColaFee(numValor, couponDiscountFraction);

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

    // For supported currencies in auto mode, derive a unique confidential Liquid address.
    // This enables automatic payment detection via Esplora without user submitting TXID.
    let liquidAddressIndex: number | null = null;
    if (AUTO_MODE_CURRENCIES.has(currency) && autoMode && isXpubConfigured()) {
      try {
        const xpub = env.LIQUID_XPUB;
        const masterBlindingKey = env.LIQUID_MASTER_BLINDING_KEY;
        liquidAddressIndex = await getNextAddressIndex(prisma);
        walletAddress = deriveLiquidAddress(xpub, masterBlindingKey, liquidAddressIndex);
      } catch (err) {
        console.error('[LiquidHD] Failed to derive address, falling back to fixed wallet:', err);
        liquidAddressIndex = null;
        // walletAddress keeps the value from pickWallet above
      }
    }

    // Retry loop handles the rare P2002 collision on liquidAddressIndex.
    // P2002 aborts the PostgreSQL transaction so the entire $transaction call must be retried;
    // we cannot catch-and-continue from inside the callback.
    const MAX_INDEX_RETRIES = 3;
    let record: any;
    for (let attempt = 0; attempt <= MAX_INDEX_RETRIES; attempt++) {
      try {
        record = await (prisma as any).$transaction(async (tx: any) => {
          // Lock the coupon row for the duration of this transaction to prevent concurrent
          // requests from exhausting the same coupon between our pre-check and INSERT.
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

          return tx.pixCopiaCola.create({
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
              taxaFixa,
              walletAddress,
              status: 'PENDING',
              affiliateId,
              apiKeyId: apiKeyId || null,
              externalRef: externalRef || null,
              isSandbox,
              exchangeRate,
              cryptoAmount,
              rateLockExpiresAt,
              liquidAddressIndex,
              userIp: userIp || '',
            },
            include: {
              user: { select: { id: true, name: true, email: true, telegram: true } },
            },
          });
        }, { timeout: 5000 });
        break;
      } catch (err: any) {
        if (err?.message === 'COUPON_EXHAUSTED') return { success: false, error: 'Cupom esgotado. Tente outro cupom ou prossiga sem desconto.' };
        if (err?.message === 'COUPON_INACTIVE') return { success: false, error: 'Cupom inativo.' };
        if (err?.code === 'P2002' && liquidAddressIndex !== null && attempt < MAX_INDEX_RETRIES) {
          // Unique constraint on liquidAddressIndex — derive a fresh index and retry.
          try {
            const xpub = env.LIQUID_XPUB;
            const masterBlindingKey = env.LIQUID_MASTER_BLINDING_KEY;
            liquidAddressIndex = await getNextAddressIndex(prisma);
            walletAddress = deriveLiquidAddress(xpub, masterBlindingKey, liquidAddressIndex);
          } catch (hdErr) {
            console.error('[LiquidHD] Failed to get new index on retry:', hdErr);
            liquidAddressIndex = null;
            walletAddress = pickWallet(walletConfig, currency);
          }
          continue;
        }
        throw err;
      }
    }

    return { success: true, pixCopiaCola: serializePcc(record) };
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

  const txidTrim = String(txid).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txidTrim)) {
    return { success: false, error: 'TXID inválido. Deve ter exatamente 64 caracteres hexadecimais (0-9, a-f).' };
  }

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

  return { success: true, pixCopiaCola: serializePcc(updated) };
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
  const record = await (prisma as any).pixCopiaCola.findFirst({
    where: { id, userId },
    include: { user: { select: { id: true, name: true, email: true, telegram: true } } }
  });
  return record ? serializePcc(record) : null;
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

  return { items: items.map(serializePcc), total, page, limit };
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
  if (!['TXID_SUBMITTED', 'VELORA_PROCESSING', 'ASAAS_PROCESSING'].includes(record.status)) {
    return { success: false, error: 'Só é possível processar solicitações com TXID informado.' };
  }

  // Captured inside the transaction for use in notifications after commit.
  let referralNotification: { earnerId: string; commission: number } | null = null;

  try {
    await (prisma as any).$transaction(async (tx: any) => {
      // Atomic claim — prevents double-approval under concurrent calls.
      // Moved inside the transaction so claim + all secondary writes are atomic.
      const claimed = await tx.pixCopiaCola.updateMany({
        where: { id, status: { in: ['TXID_SUBMITTED', 'VELORA_PROCESSING', 'ASAAS_PROCESSING'] } },
        data: {
          status: action,
          adminNotes: adminNotes?.trim() || null,
          processedAt: new Date(),
          ...(comprovanteAdminUrl ? { comprovante: comprovanteAdminUrl } : {}),
        },
      });
      if (claimed.count === 0) throw new Error('PCC_ALREADY_PROCESSED');

      if (action !== 'APPROVED') return;

      await tx.user.update({
        where: { id: record.userId },
        data: { totalPaid: { increment: Number(record.totalFinal) } },
      });

      // Comissão de indicação (referral)
      const owner = await tx.user.findUnique({ where: { id: record.userId }, select: { referredByCode: true } });
      if (owner?.referredByCode) {
        const referrer = await tx.user.findUnique({ where: { referralCode: owner.referredByCode }, select: { id: true } });
        if (referrer) {
          const referralCommission = Math.floor(Number(record.valorTaxa) * REFERRAL_RATE * 100) / 100;
          await tx.referralEarning.create({
            data: {
              earnerId: referrer.id,
              sourceUserId: record.userId,
              pixCopiaColaId: record.id,
              feeAmount: Number(record.valorTaxa),
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

      // Comissão de afiliado
      if (record.affiliateId) {
        const existingAffiliateTx = await tx.affiliateTransaction.findFirst({
          where: { affiliateId: record.affiliateId, pixCopiaColaId: record.id },
        });
        if (!existingAffiliateTx) {
          const commissionAmount = Math.floor(Number(record.valorOriginal) * 0.01 * 100) / 100;
          if (commissionAmount > 0) {
            await tx.affiliateTransaction.create({
              data: {
                affiliateId: record.affiliateId,
                pixCopiaColaId: record.id,
                amount: Number(record.totalFinal),
                commission: commissionAmount,
                status: 'AVAILABLE',
                availableAt: new Date(),
              },
            });
            await tx.affiliate.update({
              where: { id: record.affiliateId },
              data: {
                balance: { increment: commissionAmount },
                totalEarned: { increment: commissionAmount },
              },
            });
          }
        }
      }

      if (action === 'APPROVED') {
        // Bug B fix: usageCount increment is outside affiliateId block — coupon usage
        // is independent of whether an affiliate was involved.
        if (record.cupomId) {
          await tx.coupon.update({
            where: { id: record.cupomId },
            data: { usageCount: { increment: 1 } },
          });
        }

        // Bug A fix: CouponUsage was never created for PCC orders — per-user daily
        // limit enforcement in validateCouponUsage was therefore inoperative for PCC.
        if (record.cupomId) {
          await tx.couponUsage.create({
            data: {
              couponId: record.cupomId,
              userId: record.userId,
              userEmail: record.user?.email ?? '',
              userTelegram: record.user?.telegram ?? '',
              userIp: record.userIp ?? '',
              pixCopiaColaId: record.id,
            },
          });
        }
      }
    }, { isolationLevel: 'Serializable', timeout: 10000 });
  } catch (err: any) {
    if (err?.message === 'PCC_ALREADY_PROCESSED') {
      console.warn(`[adminProcessPixCopiaCola] Order ${id} already processed by concurrent call — skipping.`);
      return { success: false, error: 'Pedido já foi processado.' };
    }
    throw err;
  }

  const updated = await (prisma as any).pixCopiaCola.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, telegram: true, telegramChatId: true } },
    },
  });

  if (action === 'APPROVED') {
    // Referral notifications fire after transaction commit — cannot roll back anyway.
    // Capture in const so TypeScript can narrow the type correctly.
    const notif = referralNotification as { earnerId: string; commission: number } | null;
    if (notif) {
      try { const { notifyAffiliateCommission } = require('./push.service'); notifyAffiliateCommission(notif.earnerId, notif.commission).catch(() => {}); } catch (_e) {}
      try { notifyUserByTelegram(notif.earnerId, `🎉 Nova comissão de indicação!\n\nVocê ganhou R$ ${notif.commission.toFixed(2)} pela aprovação de um Pix Copia e Cola do seu indicado.`).catch(() => {}); } catch (_e) {}
    }

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

  return { success: true, pixCopiaCola: serializePcc(updated) };
}

// ========================================
// ADMIN: CANCEL
// ========================================
export async function adminCancelPixCopiaCola(
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string; pixCopiaCola?: any }> {
  // Atomic: only cancel if still PENDING — prevents race with payment flow
  const claimed = await (prisma as any).pixCopiaCola.updateMany({
    where: { id, status: 'PENDING' },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: reason || 'Cancelado pelo administrador',
      adminNotes: reason || 'Cancelado pelo administrador',
    },
  });
  if (claimed.count === 0) {
    const record = await (prisma as any).pixCopiaCola.findUnique({ where: { id } });
    if (!record) return { success: false, error: 'Solicitação não encontrada.' };
    return { success: false, error: `Não é possível cancelar pedido com status ${record.status}.` };
  }
  const updated = await (prisma as any).pixCopiaCola.findUnique({ where: { id } });
  return { success: true, pixCopiaCola: serializePcc(updated) };
}

export async function adminCancelAllPending(): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const result = await (prisma as any).pixCopiaCola.updateMany({
      where: { status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'Cancelamento em massa pelo administrador',
        adminNotes: 'Cancelamento em massa pelo administrador',
      },
    });
    return { success: true, count: result.count };
  } catch (err) {
    console.error('[adminCancelAllPending] erro:', err);
    return { success: false, count: 0, error: 'Erro ao cancelar pedidos.' };
  }
}

// ========================================
// ADMIN: PAY VIA VELORA
// ========================================
export async function adminPayViaVelora(
  id: string
): Promise<{ success: boolean; error?: string; pixCopiaCola?: any }> {
  const record = await (prisma as any).pixCopiaCola.findUnique({ where: { id } });
  if (!record) return { success: false, error: 'Solicitação não encontrada.' };
  if (record.status !== 'TXID_SUBMITTED') {
    return { success: false, error: 'Só é possível pagar solicitações com TXID informado.' };
  }

  // Rate lock: for USDT/BTC, reject if rate expired — stale exchange rate would cause financial loss.
  // DEPIX is 1:1 BRL, no rate risk.
  if (record.paymentCurrency !== 'DEPIX' && record.rateLockExpiresAt && new Date() > new Date(record.rateLockExpiresAt)) {
    notifyAdmin(
      `⚠️ *Pagamento bloqueado — cotação expirada* PCC #${id.slice(0, 8)}\n` +
      `Moeda: ${record.paymentCurrency}\n` +
      `Cotação expirou em ${new Date(record.rateLockExpiresAt).toISOString()}\n` +
      `Aprovar manualmente após validar cotação atual.`
    ).catch(() => {});
    return { success: false, error: 'Cotação expirada. Valide a cotação atual antes de aprovar manualmente.' };
  }

  // Atomic idempotency guard: claim the payment slot before calling Velora.
  // If paidViaVelora is already true (concurrent call or retry), count=0 → abort.
  // This prevents double-payment even under concurrent execution.
  const claimed = await (prisma as any).pixCopiaCola.updateMany({
    where: { id, status: 'TXID_SUBMITTED', paidViaVelora: false },
    data: { paidViaVelora: true, status: 'VELORA_PROCESSING' },
  });
  if (claimed.count === 0) {
    console.warn(`[adminPayViaVelora] Order ${id} already claimed or in wrong state — aborting.`);
    return { success: false, error: 'Pagamento já está sendo processado ou já foi enviado.' };
  }

  const { veloraPayPixQrCode } = await import('./velora.service');

  const veloraResult = await veloraPayPixQrCode(
    record.codigoPix,
    Number(record.valorOriginal),  // sempre explícito — nunca deixar Velora decidir o valor
    `PagDepix PCC #${record.id.slice(0, 8)}`
  );

  if (!veloraResult.success) {
    // Release the claim so admin can retry manually.
    await (prisma as any).pixCopiaCola.update({
      where: { id },
      data: { paidViaVelora: false, status: 'TXID_SUBMITTED' },
    }).catch(() => {});
    notifyAdmin(
      `❌ *Falha Velora* PCC #${id.slice(0, 8)}\n` +
      `Erro: ${veloraResult.error}\n` +
      `💰 R$ ${record.totalFinal?.toFixed(2)} → ${record.nomeDestinatario}`
    ).catch(() => {});
    return { success: false, error: veloraResult.error || 'Falha ao enviar pagamento via Velora.' };
  }

  // Persist Velora reference (paidViaVelora already set to true by the claim above)
  await (prisma as any).pixCopiaCola.update({
    where: { id },
    data: {
      veloraExternalId: veloraResult.externalId ?? null,
      veloraStatus: veloraResult.status ?? 'PENDING',
    },
  });

  // Telegram alert: payment confirmed and sent
  notifyAdmin(
    `✅ *PIX pago via Velora* PCC #${id.slice(0, 8)}\n` +
    `💰 R$ ${record.valorOriginal?.toFixed(2)} → ${record.nomeDestinatario}\n` +
    `🔗 Velora ID: ${veloraResult.externalId ?? 'N/A'}`
  ).catch(() => {});

  const adminNotes = `Pago via Velora${veloraResult.externalId ? ` (ID: ${veloraResult.externalId})` : ''}`;
  return adminProcessPixCopiaCola(id, 'APPROVED', adminNotes);
}

// ========================================
// ADMIN: PAY VIA ASAAS
// ========================================
export async function adminPayViaAsaas(
  id: string
): Promise<{ success: boolean; error?: string; pixCopiaCola?: any }> {
  const record = await (prisma as any).pixCopiaCola.findUnique({ where: { id } });
  if (!record) return { success: false, error: 'Solicitação não encontrada.' };
  if (record.status !== 'TXID_SUBMITTED') {
    return { success: false, error: 'Só é possível pagar solicitações com TXID informado.' };
  }

  if (record.paymentCurrency !== 'DEPIX' && record.rateLockExpiresAt && new Date() > new Date(record.rateLockExpiresAt)) {
    notifyAdmin(
      `⚠️ *Pagamento bloqueado — cotação expirada* PCC #${id.slice(0, 8)}\n` +
      `Moeda: ${record.paymentCurrency}\n` +
      `Cotação expirou em ${new Date(record.rateLockExpiresAt).toISOString()}\n` +
      `Aprovar manualmente após validar cotação atual.`
    ).catch(() => {});
    return { success: false, error: 'Cotação expirada. Valide a cotação atual antes de aprovar manualmente.' };
  }

  // Atomic idempotency guard: claim the slot before calling Asaas.
  const claimed = await (prisma as any).pixCopiaCola.updateMany({
    where: { id, status: 'TXID_SUBMITTED', paidViaAsaas: false },
    data: { paidViaAsaas: true, status: 'ASAAS_PROCESSING' },
  });
  if (claimed.count === 0) {
    console.warn(`[adminPayViaAsaas] Order ${id} already claimed or in wrong state — aborting.`);
    return { success: false, error: 'Pagamento já está sendo processado ou já foi enviado.' };
  }

  const { asaasPayPixQrCode } = await import('./asaas.service');

  const asaasResult = await asaasPayPixQrCode(
    record.codigoPix,
    Number(record.valorOriginal),
    `PagDepix PCC #${record.id.slice(0, 8)}`
  );

  if (!asaasResult.success) {
    await (prisma as any).pixCopiaCola.update({
      where: { id },
      data: { paidViaAsaas: false, status: 'TXID_SUBMITTED' },
    }).catch(() => {});
    notifyAdmin(
      `❌ *Falha Asaas* PCC #${id.slice(0, 8)}\n` +
      `Erro: ${asaasResult.error}\n` +
      `💰 R$ ${record.totalFinal?.toFixed(2)} → ${record.nomeDestinatario}`
    ).catch(() => {});
    return { success: false, error: asaasResult.error || 'Falha ao enviar pagamento via Asaas.' };
  }

  await (prisma as any).pixCopiaCola.update({
    where: { id },
    data: {
      asaasExternalId: asaasResult.externalId ?? null,
      asaasStatus: asaasResult.status ?? 'PENDING',
    },
  });

  notifyAdmin(
    `✅ *PIX pago via Asaas* PCC #${id.slice(0, 8)}\n` +
    `💰 R$ ${record.valorOriginal?.toFixed(2)} → ${record.nomeDestinatario}\n` +
    `🔗 Asaas ID: ${asaasResult.externalId ?? 'N/A'}`
  ).catch(() => {});

  const adminNotes = `Pago via Asaas${asaasResult.externalId ? ` (ID: ${asaasResult.externalId})` : ''}`;
  return adminProcessPixCopiaCola(id, 'APPROVED', adminNotes);
}
