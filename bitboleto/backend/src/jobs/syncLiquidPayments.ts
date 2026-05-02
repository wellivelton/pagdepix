import { prisma } from '../prisma';
import {
  checkEsploraForAssetPayment,
  deriveLiquidAddressAndKey,
  isXpubConfigured,
  getAssetId,
  computeExpectedUnits,
  AUTO_MODE_CURRENCIES,
} from '../services/liquidHdWallet.service';

import { veloraGetBalance, veloraGetPaymentStatus } from '../services/velora.service';
import { notifyAdmin } from '../services/telegram.service';

const JOB_INTERVAL_MS = 60 * 1000;
const MAX_ORDER_AGE_HOURS = 48;
const EXPIRE_AFTER_HOURS = 24;
const VELORA_LOW_BALANCE_THRESHOLD = 200; // R$200

// Check Velora balance and alert if low — runs every 10 job cycles (~10 min)
let balanceCheckCounter = 0;
async function checkVeloraBalance() {
  balanceCheckCounter++;
  if (balanceCheckCounter % 10 !== 1) return;

  try {
    const result = await veloraGetBalance();
    if (!result.success || result.balance == null) return;
    const balance = result.balance;

    if (balance < VELORA_LOW_BALANCE_THRESHOLD) {
      notifyAdmin(
        `⚠️ *Saldo Velora baixo!*\n` +
        `💰 Saldo atual: R$ ${balance.toFixed(2)}\n` +
        `🚨 Limite mínimo: R$ ${VELORA_LOW_BALANCE_THRESHOLD.toFixed(2)}\n` +
        `Por favor, recarregue para continuar pagamentos automáticos.`
      ).catch(() => {});
      console.warn(`[SyncLiquid] Velora balance low: R$${balance.toFixed(2)}`);
    }
  } catch { /* non-critical */ }
}

// ===================================================
// Expirar pedidos PENDING sem pagamento após 24h
// Aplica a TODAS as moedas
// ===================================================
async function expireStalePendingOrders() {
  const expiryCutoff = new Date(Date.now() - EXPIRE_AFTER_HOURS * 60 * 60 * 1000);

  const result = await (prisma as any).pixCopiaCola.updateMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: expiryCutoff },
    },
    data: { status: 'EXPIRED' },
  });

  if (result.count > 0) {
    console.log(`[SyncLiquid] Expired ${result.count} stale PENDING orders (older than ${EXPIRE_AFTER_HOURS}h)`);
  }
}

// ===================================================
// Detectar pagamento via Esplora + auto-aprovar
// ===================================================
async function processPendingOrder(order: {
  id: string;
  walletAddress: string;
  totalFinal: number;
  cryptoAmount: string | null;
  paymentCurrency: string;
  liquidAddressIndex: number;
  rateLockExpiresAt: Date | null;
}) {
  const xpub = process.env.LIQUID_XPUB!;
  const masterBlindingKey = process.env.LIQUID_MASTER_BLINDING_KEY!;

  const { blindingPrivKey } = deriveLiquidAddressAndKey(xpub, masterBlindingKey, order.liquidAddressIndex);

  let assetId: string;
  let expectedUnits: number;

  try {
    assetId = getAssetId(order.paymentCurrency);
    expectedUnits = computeExpectedUnits(order.paymentCurrency, order.totalFinal, order.cryptoAmount);
  } catch (err) {
    console.error(`[SyncLiquid] Cannot compute expected units for order ${order.id}:`, err);
    return;
  }

  const txid = await checkEsploraForAssetPayment(
    order.walletAddress,
    expectedUnits,
    assetId,
    blindingPrivKey,
  );
  if (!txid) return;

  console.log(`[SyncLiquid] Payment detected for order ${order.id} (${order.paymentCurrency}), txid: ${txid}`);

  const updated = await (prisma as any).pixCopiaCola.updateMany({
    where: { id: order.id, status: 'PENDING' },
    data: { txid, txidSubmittedAt: new Date(), status: 'TXID_SUBMITTED' },
  });

  if (updated.count === 0) return; // race condition guard — another process already updated

  // Rate lock check: DEPIX is 1:1 BRL so expiry is irrelevant.
  // For USDT/BTC, if the rate lock expired the stored cryptoAmount may no longer
  // cover the full BRL value. Record the payment but skip auto-pay and alert admin.
  const hasRateLock = order.paymentCurrency !== 'DEPIX' && order.rateLockExpiresAt != null;
  const rateLockExpired = hasRateLock && new Date() > new Date(order.rateLockExpiresAt!);

  if (rateLockExpired) {
    await (prisma as any).pixCopiaCola.update({
      where: { id: order.id },
      data: { rateExpired: true },
    }).catch(() => {});
    notifyAdmin(
      `⚠️ *Pagamento detectado — cotação expirada* PCC #${order.id.slice(0, 8)}\n` +
      `💰 Moeda: ${order.paymentCurrency}\n` +
      `TXID registrado mas pagamento automático suspenso.\n` +
      `Aprovar manualmente após validar cotação atual.`
    ).catch(() => {});
    console.warn(`[SyncLiquid] Rate lock expired for ${order.id} (${order.paymentCurrency}) — manual approval required`);
    return;
  }

  try {
    const { adminPayViaVelora } = await import('../services/pixCopiaCola');
    const result = await adminPayViaVelora(order.id);
    if (result.success) {
      console.log(`[SyncLiquid] Auto-approved + Velora payment sent for order ${order.id}`);
    } else {
      console.warn(`[SyncLiquid] Velora auto-pay failed for ${order.id}: ${result.error} — admin must approve manually`);
    }
  } catch (err) {
    console.error(`[SyncLiquid] adminPayViaVelora threw for ${order.id}:`, err);
  }
}

// ===================================================
// Crash recovery: reconcile VELORA_PROCESSING orders
// ===================================================
// Orders in VELORA_PROCESSING had a Velora payment initiated but the server
// crashed (or lost connection) before the DB was updated to APPROVED.
// On restart, this reconciles them by querying Velora's actual payment status.
async function reconcileVeloraProcessingOrders() {
  const orders = await (prisma as any).pixCopiaCola.findMany({
    where: { status: 'VELORA_PROCESSING' },
    select: { id: true, veloraExternalId: true, valorOriginal: true, nomeDestinatario: true },
    take: 20,
  });

  if (orders.length === 0) return;
  console.log(`[SyncLiquid] Reconciling ${orders.length} VELORA_PROCESSING order(s)`);

  const { adminProcessPixCopiaCola } = await import('../services/pixCopiaCola');

  for (const order of orders) {
    try {
      if (!order.veloraExternalId) {
        // Velora call never returned an ID — unknown outcome, reset for manual review
        await (prisma as any).pixCopiaCola.update({
          where: { id: order.id },
          data: { paidViaVelora: false, status: 'TXID_SUBMITTED' },
        }).catch(() => {});
        notifyAdmin(
          `⚠️ *Reconciliação: ID Velora ausente* PCC #${order.id.slice(0, 8)}\n` +
          `Status revertido para TXID_SUBMITTED. Verificar manualmente.`
        ).catch(() => {});
        console.warn(`[SyncLiquid] Reconcile: no veloraExternalId for order ${order.id} — reset to TXID_SUBMITTED`);
        continue;
      }

      const status = await veloraGetPaymentStatus(order.veloraExternalId);
      if (!status.success) {
        console.warn(`[SyncLiquid] Reconcile: Velora status check failed for ${order.id}: ${status.error}`);
        continue; // retry next cycle
      }

      if (status.isPaid) {
        const notes = `Auto-reconciliado via Velora (ID: ${order.veloraExternalId})`;
        const result = await adminProcessPixCopiaCola(order.id, 'APPROVED', notes);
        if (result.success) {
          console.log(`[SyncLiquid] Reconcile: order ${order.id} APPROVED (Velora ${order.veloraExternalId})`);
        } else {
          console.warn(`[SyncLiquid] Reconcile: adminProcessPixCopiaCola failed for ${order.id}: ${result.error}`);
        }
      } else if (status.isFailed) {
        await (prisma as any).pixCopiaCola.update({
          where: { id: order.id },
          data: { paidViaVelora: false, status: 'TXID_SUBMITTED' },
        }).catch(() => {});
        notifyAdmin(
          `❌ *Velora: pagamento falhou* PCC #${order.id.slice(0, 8)}\n` +
          `Status Velora: ${status.rawStatus}\n` +
          `💰 R$ ${order.valorOriginal?.toFixed(2)} → ${order.nomeDestinatario}\n` +
          `Pedido revertido para TXID_SUBMITTED — requer aprovação manual.`
        ).catch(() => {});
        console.warn(`[SyncLiquid] Reconcile: Velora payment failed for order ${order.id} (status: ${status.rawStatus}) — reset to TXID_SUBMITTED`);
      } else {
        // Still processing at Velora — leave in VELORA_PROCESSING, check again next cycle
        console.log(`[SyncLiquid] Reconcile: order ${order.id} still processing at Velora (status: ${status.rawStatus})`);
      }
    } catch (err) {
      console.error(`[SyncLiquid] Reconcile error for order ${order.id}:`, err);
    }
  }
}

// ===================================================
// Detectar pagamento de Boleto via Esplora
// ===================================================
async function processPendingBoleto(boleto: {
  id: string;
  walletAddress: string;
  totalAmount: number;
  cryptoAmount: string | null;
  paymentCurrency: string;
  liquidAddressIndex: number;
  rateLockExpiresAt: Date | null;
  barcode: string | null;
}) {
  const xpub = process.env.LIQUID_XPUB!;
  const masterBlindingKey = process.env.LIQUID_MASTER_BLINDING_KEY!;
  const { blindingPrivKey } = deriveLiquidAddressAndKey(xpub, masterBlindingKey, boleto.liquidAddressIndex);

  let assetId: string;
  let expectedUnits: number;
  try {
    assetId = getAssetId(boleto.paymentCurrency);
    expectedUnits = computeExpectedUnits(boleto.paymentCurrency, boleto.totalAmount, boleto.cryptoAmount);
  } catch (err) {
    console.error(`[SyncLiquid] Boleto ${boleto.id} unit compute error:`, err);
    return;
  }

  const txid = await checkEsploraForAssetPayment(boleto.walletAddress, expectedUnits, assetId, blindingPrivKey);
  if (!txid) return;

  console.log(`[SyncLiquid] Boleto payment detected: ${boleto.id}, txid: ${txid}`);

  const updated = await (prisma as any).boleto.updateMany({
    where: { id: boleto.id, status: 'PENDING' },
    data: { txid },
  });
  if (updated.count === 0) return;

  const hasRateLock = boleto.paymentCurrency !== 'DEPIX' && boleto.rateLockExpiresAt != null;
  const rateLockExpired = hasRateLock && new Date() > new Date(boleto.rateLockExpiresAt!);

  if (rateLockExpired) {
    await (prisma as any).boleto.update({ where: { id: boleto.id }, data: { rateExpired: true } }).catch(() => {});
    notifyAdmin(
      `⚠️ *Boleto: pagamento detectado — cotação expirada* #${boleto.id.slice(0, 8)}\n` +
      `Moeda: ${boleto.paymentCurrency}\nTXID registrado. Aprovar manualmente após validar cotação.`
    ).catch(() => {});
    return;
  }

  notifyAdmin(
    `💰 *Boleto recebido!* #${boleto.id.slice(0, 8)}\n` +
    `Moeda: ${boleto.paymentCurrency} · Valor: R$ ${boleto.totalAmount.toFixed(2)}\n` +
    `${boleto.barcode ? `Cód. barras: ${boleto.barcode.slice(0, 30)}...\n` : ''}` +
    `TXID: ${txid}\nAprove e pague via Asaas no painel admin.`
  ).catch(() => {});
}

// ===================================================
// Detectar pagamento de BoletoBatch via Esplora
// ===================================================
async function processPendingBatch(batch: {
  id: string;
  walletAddress: string;
  grandTotal: number;
  cryptoAmount: string | null;
  paymentCurrency: string;
  liquidAddressIndex: number;
  rateLockExpiresAt: Date | null;
}) {
  const xpub = process.env.LIQUID_XPUB!;
  const masterBlindingKey = process.env.LIQUID_MASTER_BLINDING_KEY!;
  const { blindingPrivKey } = deriveLiquidAddressAndKey(xpub, masterBlindingKey, batch.liquidAddressIndex);

  let assetId: string;
  let expectedUnits: number;
  try {
    assetId = getAssetId(batch.paymentCurrency);
    expectedUnits = computeExpectedUnits(batch.paymentCurrency, batch.grandTotal, batch.cryptoAmount);
  } catch (err) {
    console.error(`[SyncLiquid] Batch ${batch.id} unit compute error:`, err);
    return;
  }

  const txid = await checkEsploraForAssetPayment(batch.walletAddress, expectedUnits, assetId, blindingPrivKey);
  if (!txid) return;

  console.log(`[SyncLiquid] Batch payment detected: ${batch.id}, txid: ${txid}`);

  const updated = await (prisma as any).boletoBatch.updateMany({
    where: { id: batch.id, status: 'PENDING' },
    data: { txid },
  });
  if (updated.count === 0) return;

  notifyAdmin(
    `💰 *Lote de boletos recebido!* #${batch.id.slice(0, 8)}\n` +
    `Moeda: ${batch.paymentCurrency} · Total: R$ ${batch.grandTotal.toFixed(2)}\n` +
    `TXID: ${txid}\nAprove no painel admin.`
  ).catch(() => {});
}

// ===================================================
// Detectar pagamento de Recarga via Esplora → auto-acionar Asaas
// ===================================================
async function processPendingRecharge(recharge: {
  id: string;
  walletAddress: string;
  totalAmount: number;
  cryptoAmount: string | null;
  paymentCurrency: string;
  liquidAddressIndex: number;
  rateLockExpiresAt: Date | null;
  phoneNumber: string;
  operator: string;
  amount: number;
}) {
  const xpub = process.env.LIQUID_XPUB!;
  const masterBlindingKey = process.env.LIQUID_MASTER_BLINDING_KEY!;
  const { blindingPrivKey } = deriveLiquidAddressAndKey(xpub, masterBlindingKey, recharge.liquidAddressIndex);

  let assetId: string;
  let expectedUnits: number;
  try {
    assetId = getAssetId(recharge.paymentCurrency);
    expectedUnits = computeExpectedUnits(recharge.paymentCurrency, recharge.totalAmount, recharge.cryptoAmount);
  } catch (err) {
    console.error(`[SyncLiquid] Recharge ${recharge.id} unit compute error:`, err);
    return;
  }

  const txid = await checkEsploraForAssetPayment(recharge.walletAddress, expectedUnits, assetId, blindingPrivKey);
  if (!txid) return;

  console.log(`[SyncLiquid] Recharge payment detected: ${recharge.id}, txid: ${txid}`);

  const updated = await (prisma as any).mobileRecharge.updateMany({
    where: { id: recharge.id, status: 'PENDING' },
    data: { txid, status: 'PROCESSING' },
  });
  if (updated.count === 0) return;

  const hasRateLock = recharge.paymentCurrency !== 'DEPIX' && recharge.rateLockExpiresAt != null;
  const rateLockExpired = hasRateLock && new Date() > new Date(recharge.rateLockExpiresAt!);

  if (rateLockExpired) {
    await (prisma as any).mobileRecharge.update({ where: { id: recharge.id }, data: { rateExpired: true } }).catch(() => {});
    notifyAdmin(
      `⚠️ *Recarga: pagamento detectado — cotação expirada* #${recharge.id.slice(0, 8)}\n` +
      `TXID registrado. Aprovar manualmente.`
    ).catch(() => {});
    return;
  }

  try {
    const { asaasCreateRecharge } = await import('../services/asaas.service');
    const asaasResult = await asaasCreateRecharge(recharge.phoneNumber, recharge.amount);
    if (asaasResult.success) {
      await (prisma as any).mobileRecharge.update({
        where: { id: recharge.id },
        data: { asaasRechargeId: asaasResult.id, asaasStatus: asaasResult.status },
      }).catch(() => {});
      notifyAdmin(
        `✅ *Recarga disparada via Asaas* #${recharge.id.slice(0, 8)}\n` +
        `📱 ${recharge.phoneNumber} · R$ ${recharge.amount.toFixed(2)}\n` +
        `Operadora: ${recharge.operator} · Asaas ID: ${asaasResult.id}`
      ).catch(() => {});
    } else {
      notifyAdmin(
        `❌ *Falha Asaas (recarga)* #${recharge.id.slice(0, 8)}\n` +
        `Erro: ${asaasResult.error}\nAprovar manualmente no painel.`
      ).catch(() => {});
    }
  } catch (err) {
    console.error(`[SyncLiquid] Asaas recharge failed for ${recharge.id}:`, err);
  }
}

async function runSync() {
  // 1. Expire stale orders (all currencies)
  await expireStalePendingOrders().catch(e => console.error('[SyncLiquid] Expire error:', e));

  // 2. Reconcile orders stuck in VELORA_PROCESSING (crash recovery)
  await reconcileVeloraProcessingOrders().catch(e => console.error('[SyncLiquid] Reconcile error:', e));

  // 3. Check Velora balance periodically
  await checkVeloraBalance();

  // 4. Check Esplora for auto-mode orders (all supported currencies)
  if (!isXpubConfigured()) return;

  const cutoff = new Date(Date.now() - MAX_ORDER_AGE_HOURS * 60 * 60 * 1000);
  const supportedCurrencies = Array.from(AUTO_MODE_CURRENCIES);

  // 4a. PixCopiaCola
  const pccOrders = await (prisma as any).pixCopiaCola.findMany({
    where: {
      status: 'PENDING',
      paymentCurrency: { in: supportedCurrencies },
      liquidAddressIndex: { not: null },
      createdAt: { gte: cutoff },
    },
    select: {
      id: true, walletAddress: true, totalFinal: true, cryptoAmount: true,
      paymentCurrency: true, liquidAddressIndex: true, rateLockExpiresAt: true,
    },
    take: 50,
    orderBy: { createdAt: 'asc' },
  });

  // 4b. Boleto (individual, com liquidAddressIndex)
  const boletoOrders = await (prisma as any).boleto.findMany({
    where: {
      status: 'PENDING',
      paymentCurrency: { in: supportedCurrencies },
      liquidAddressIndex: { not: null },
      txid: null,
      createdAt: { gte: cutoff },
    },
    select: {
      id: true, walletAddress: true, totalAmount: true, cryptoAmount: true,
      paymentCurrency: true, liquidAddressIndex: true, rateLockExpiresAt: true, barcode: true,
    },
    take: 50,
    orderBy: { createdAt: 'asc' },
  });

  // 4c. BoletoBatch (com liquidAddressIndex)
  const batchOrders = await (prisma as any).boletoBatch.findMany({
    where: {
      status: 'PENDING',
      paymentCurrency: { in: supportedCurrencies },
      liquidAddressIndex: { not: null },
      txid: null,
      createdAt: { gte: cutoff },
    },
    select: {
      id: true, walletAddress: true, grandTotal: true, cryptoAmount: true,
      paymentCurrency: true, liquidAddressIndex: true, rateLockExpiresAt: true,
    },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });

  // 4d. MobileRecharge (com liquidAddressIndex)
  const rechargeOrders = await (prisma as any).mobileRecharge.findMany({
    where: {
      status: 'PENDING',
      paymentCurrency: { in: supportedCurrencies },
      liquidAddressIndex: { not: null },
      txid: null,
      createdAt: { gte: cutoff },
    },
    select: {
      id: true, walletAddress: true, totalAmount: true, cryptoAmount: true,
      paymentCurrency: true, liquidAddressIndex: true, rateLockExpiresAt: true,
      phoneNumber: true, operator: true, amount: true,
    },
    take: 50,
    orderBy: { createdAt: 'asc' },
  });

  const total = pccOrders.length + boletoOrders.length + batchOrders.length + rechargeOrders.length;
  if (total === 0) return;

  console.log(`[SyncLiquid] Checking via Esplora: PCC=${pccOrders.length} Boleto=${boletoOrders.length} Batch=${batchOrders.length} Recharge=${rechargeOrders.length}`);

  for (const order of pccOrders) {
    try { await processPendingOrder(order); } catch (err) {
      console.error(`[SyncLiquid] PCC ${order.id}:`, err);
    }
  }
  for (const boleto of boletoOrders) {
    try { await processPendingBoleto(boleto); } catch (err) {
      console.error(`[SyncLiquid] Boleto ${boleto.id}:`, err);
    }
  }
  for (const batch of batchOrders) {
    try {
      await processPendingBatch(batch);
    } catch (err) {
      console.error(`[SyncLiquid] Batch ${batch.id}:`, err);
    }
  }
  for (const recharge of rechargeOrders) {
    try { await processPendingRecharge(recharge); } catch (err) {
      console.error(`[SyncLiquid] Recharge ${recharge.id}:`, err);
    }
  }
}

export function startSyncLiquidPayments() {
  console.log('[SyncLiquid] Starting (expiration + multi-asset Liquid payment sync, 60s interval)');
  runSync().catch(e => console.error('[SyncLiquid] Initial run error:', e));
  setInterval(() => {
    runSync().catch(e => console.error('[SyncLiquid] Sync error:', e));
  }, JOB_INTERVAL_MS);
}
