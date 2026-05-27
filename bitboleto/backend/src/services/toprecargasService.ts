import { prisma } from '../prisma';
import { getRates, convertBrlToUsdt, convertBrlToSats } from './exchangeRate';
import { isXpubConfigured, getNextAddressIndex, deriveLiquidAddress } from './liquidHdWallet.service';
import { env } from '../config/env';
import { notifyAdmin } from './telegram.service';
import { sendNotification } from './push.service';
import { sendToprecargasCodeEmail } from './email.service';

const TOPRECARGAS_BASE = (process.env.TOPRECARGAS_API_URL || 'http://185.241.151.200:2223').replace(/\/$/, '');
const PRECO_FIXO = parseFloat(process.env.TOPRECARGAS_PRECO_FIXO ?? '30');
const INTERNAL_SECRET = process.env.TOPRECARGAS_INTERNAL_SECRET ?? '';

// ============================================================
// List products (public — no auth required)
// ============================================================
export async function listToprecargasProducts() {
  const products = await prisma.toprecargasProduct.findMany({
    where: { visivel: true },
    orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
  });

  return products.map(p => ({
    productId: `tr-${p.externalId}`,
    name: p.nome,
    brand: 'TopRecargas',
    amount: PRECO_FIXO,
    category: 'apps',
    variable: false,
    estoqueDisponivel: p.estoqueDisponivel,
    descricao: p.descricao ?? undefined,
    _localId: p.id,
    _externalId: p.externalId,
  }));
}

// ============================================================
// Create order
// ============================================================
export async function createToprecargasOrder(params: {
  userId: string;
  externalProductId: number;
  paymentCurrency: 'DEPIX' | 'USDT' | 'BTC';
  userIp?: string;
}) {
  const { userId, externalProductId, paymentCurrency, userIp } = params;

  const product = await prisma.toprecargasProduct.findUnique({
    where: { externalId: externalProductId },
  });

  if (!product || !product.visivel) {
    return { success: false, error: 'Produto indisponível ou fora de estoque.' };
  }
  if (product.estoqueDisponivel <= 0) {
    return { success: false, error: 'Produto esgotado. Tente novamente mais tarde.' };
  }

  const precoFinal = PRECO_FIXO;
  const fee = 0;
  const totalAmount = precoFinal;

  let walletAddr: string;
  let liquidAddressIndex: number | null = null;
  let exchangeRate: number | null = null;
  let cryptoAmount: string | null = null;
  let rateLockExpiresAt: Date | null = null;

  const xpubOk = isXpubConfigured();
  if (!xpubOk) {
    return { success: false, error: 'Carteira de pagamento não configurada. Tente mais tarde.' };
  }

  liquidAddressIndex = await getNextAddressIndex(prisma);
  walletAddr = deriveLiquidAddress(env.LIQUID_XPUB, env.LIQUID_MASTER_BLINDING_KEY, liquidAddressIndex);

  if (paymentCurrency === 'USDT') {
    const rates = await getRates();
    exchangeRate = rates.usdBrl;
    cryptoAmount = convertBrlToUsdt(totalAmount, rates.usdBrl).toFixed(2);
    rateLockExpiresAt = new Date(Date.now() + 30 * 60_000);
  } else if (paymentCurrency === 'BTC') {
    const rates = await getRates();
    exchangeRate = rates.btcBrl;
    cryptoAmount = String(convertBrlToSats(totalAmount, rates.btcBrl));
    rateLockExpiresAt = new Date(Date.now() + 30 * 60_000);
  }

  const MAX_RETRIES = 3;
  let order: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      order = await prisma.toprecargasOrder.create({
        data: {
          userId,
          productId: product.id,
          externalProductId,
          productName: product.nome,
          productCategoria: product.categoria,
          precoOriginal: product.preco,
          precoFinal,
          fee,
          totalAmount,
          depixAmount: totalAmount,
          walletAddress: walletAddr,
          liquidAddressIndex: liquidAddressIndex ?? undefined,
          paymentCurrency: paymentCurrency as any,
          exchangeRate,
          cryptoAmount,
          rateLockExpiresAt,
          status: 'PENDING',
          userIp: userIp ?? '',
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      break;
    } catch (err: any) {
      if (err?.code === 'P2002' && liquidAddressIndex !== null && attempt < MAX_RETRIES) {
        liquidAddressIndex = await getNextAddressIndex(prisma);
        walletAddr = deriveLiquidAddress(env.LIQUID_XPUB, env.LIQUID_MASTER_BLINDING_KEY, liquidAddressIndex);
        continue;
      }
      throw err;
    }
  }

  return {
    success: true,
    order: {
      id: order.id,
      productName: order.productName,
      totalAmount: order.totalAmount,
      depixAmount: order.depixAmount,
      walletAddress: order.walletAddress,
      paymentCurrency: order.paymentCurrency,
      exchangeRate: order.exchangeRate,
      cryptoAmount: order.cryptoAmount,
      rateLockExpiresAt: order.rateLockExpiresAt,
      status: order.status,
      createdAt: order.createdAt,
    },
  };
}

// ============================================================
// List user orders
// ============================================================
export async function listToprecargasOrders(userId: string) {
  return prisma.toprecargasOrder.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      productName: true,
      productCategoria: true,
      totalAmount: true,
      paymentCurrency: true,
      status: true,
      codigoEntregue: true,
      codigoMensagem: true,
      createdAt: true,
      paidAt: true,
      deliveredAt: true,
    },
  });
}

// ============================================================
// Get single order by ID (validates ownership)
// ============================================================
export async function getToprecargasOrderById(id: string, userId: string) {
  const order = await prisma.toprecargasOrder.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      productName: true,
      productCategoria: true,
      totalAmount: true,
      depixAmount: true,
      walletAddress: true,
      paymentCurrency: true,
      exchangeRate: true,
      cryptoAmount: true,
      rateLockExpiresAt: true,
      status: true,
      codigoEntregue: true,
      codigoMensagem: true,
      createdAt: true,
      paidAt: true,
      deliveredAt: true,
    },
  });

  if (!order || order.userId !== userId) return null;
  return order;
}

// ============================================================
// Deliver code after payment detected (called by sync job)
// ============================================================
export async function deliverToprecargasCode(orderId: string): Promise<void> {
  if (!INTERNAL_SECRET) {
    console.error('[TopRecargas] TOPRECARGAS_INTERNAL_SECRET não configurada — entrega impossível');
    return;
  }

  const order = await prisma.toprecargasOrder.findUnique({
    where: { id: orderId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!order || order.status !== 'PROCESSING') return;

  await prisma.toprecargasOrder.update({
    where: { id: orderId },
    data: { status: 'DELIVERY_PENDING', deliveryAttempts: { increment: 1 } },
  });

  try {
    const res = await fetch(`${TOPRECARGAS_BASE}/api/internal/entregar-codigo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INTERNAL_SECRET}`,
      },
      body: JSON.stringify({ produto_id: order.externalProductId }),
      signal: AbortSignal.timeout(12_000),
    });

    const body = await res.json() as any;

    if (!res.ok || !body.sucesso) {
      const errMsg = body.erro ?? `HTTP ${res.status}`;
      await prisma.toprecargasOrder.update({
        where: { id: orderId },
        data: { status: 'PROCESSING', lastDeliveryError: errMsg },
      });
      notifyAdmin(`❌ TopRecargas: falha na entrega #${orderId.slice(0, 8)} — ${errMsg}`).catch(() => {});
      return;
    }

    await prisma.toprecargasOrder.update({
      where: { id: orderId },
      data: {
        status: 'DELIVERED',
        codigoEntregue: body.codigo,
        codigoMensagem: body.mensagem ?? null,
        toprecargasDeliveryId: body.delivery_id ? String(body.delivery_id) : null,
        deliveredAt: new Date(),
        lastDeliveryError: null,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'https://pagdepix.com';
    sendNotification(order.userId, {
      title: '🎁 Seu código chegou!',
      body: `${order.productName} — código disponível em Minhas Compras.`,
      link: `${frontendUrl}/minhas-compras`,
      tag: 'toprecargas-delivered',
    }).catch(() => {});

    if (order.user.email) {
      sendToprecargasCodeEmail(order.user.email, order.user.name, {
        productName: order.productName,
        orderId: order.id,
        codigo: body.codigo,
        codigoMensagem: body.mensagem ?? null,
        totalAmount: order.totalAmount,
      }).catch(() => {});
    }

    notifyAdmin(`✅ TopRecargas: código entregue #${orderId.slice(0, 8)} — ${order.productName}`).catch(() => {});
  } catch (err: any) {
    await prisma.toprecargasOrder.update({
      where: { id: orderId },
      data: { status: 'PROCESSING', lastDeliveryError: String(err?.message ?? err) },
    });
    notifyAdmin(`❌ TopRecargas: exceção na entrega #${orderId.slice(0, 8)} — ${err?.message}`).catch(() => {});
  }
}
