import { Request, Response } from 'express';
import { prisma } from '../prisma';
import {
  isSideSwapConfigured,
  listMarkets,
  getQuote,
  getPreviewQuote,
  signAndBroadcast,
  logSwapEvent,
  SideSwapAsset,
  SideSwapMarket,
} from '../services/sideswap.service';
import { notifySwapCompleted, notifySwapFailed } from '../services/push.service';
import { sendTelegramMessage } from '../services/telegram.service';
import {
  deriveLiquidAddressAndKey,
  getNextAddressIndex,
  checkEsploraForAssetPayment,
  LIQUID_ASSET_IDS,
} from '../services/liquidHdWallet.service';
import * as liquid from 'liquidjs-lib';

const ESPLORA_BASE = process.env.ESPLORA_BASE_URL || 'https://blockstream.info/liquid/api';
const IS_TESTNET   = process.env.SIDESWAP_TESTNET === 'true';

// Asset IDs for testnet (from listMarkets)
const TESTNET_ASSET_IDS: Record<string, string> = {
  DEPIX: 'a5de979bc31dc731fa94b3661ae19c1e20cd067642c69798cad9011094a26f60',
  USDT:  'b612eb46313a2cd6ebabd8b7a8eed5696e29898b87a43bff41c94f51acef9d73',
  LBTC:  '144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49',
};

function notConfigured(res: Response) {
  return res.status(503).json({ error: 'SideSwap não configurado.' });
}

function userId(req: Request): string {
  const id = (req as any).userId;
  return Array.isArray(id) ? id[0] : String(id);
}

const TICKER_ALIAS: Record<string, string> = { LBTC: 'BTC' };

function resolveAssetId(ticker: string): string {
  const t = TICKER_ALIAS[ticker.toUpperCase()] ?? ticker.toUpperCase();
  if (IS_TESTNET) return TESTNET_ASSET_IDS[t] ?? LIQUID_ASSET_IDS[t] ?? '';
  return LIQUID_ASSET_IDS[t] ?? '';
}

// ─── GET /sideswap/markets ────────────────────────────────────────────────────

export async function getMarkets(req: Request, res: Response) {
  if (!isSideSwapConfigured()) return notConfigured(res);
  try {
    const { assets, markets } = await listMarkets();
    return res.json({ assets, markets, testnet: IS_TESTNET });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar mercados.';
    return res.status(502).json({ error: msg });
  }
}

// ─── GET /sideswap/preview ────────────────────────────────────────────────────

export async function previewQuote(req: Request, res: Response) {
  if (!isSideSwapConfigured()) return notConfigured(res);

  const { depositAsset, settleAsset, amount } = req.query as {
    depositAsset?: string;
    settleAsset?: string;
    amount?: string;
  };

  if (!depositAsset || !settleAsset) {
    return res.status(400).json({ error: 'depositAsset e settleAsset são obrigatórios.' });
  }

  const depositAssetId = resolveAssetId(depositAsset);
  const settleAssetId  = resolveAssetId(settleAsset);

  if (!depositAssetId || !settleAssetId) {
    return res.status(400).json({ error: `Asset não suportado: ${depositAsset} ou ${settleAsset}` });
  }

  const xpub     = process.env.SIDESWAP_LIQUID_XPUB || '';
  const blindKey = process.env.LIQUID_MASTER_BLINDING_KEY || '';

  if (!xpub || !blindKey) {
    return res.status(503).json({ error: 'Carteira não configurada.' });
  }

  const sendAmountSats = amount ? Math.round(parseFloat(amount) * 1e8) : 100_000_000;
  if (!sendAmountSats || sendAmountSats <= 0) {
    return res.status(400).json({ error: 'amount inválido.' });
  }

  try {
    const { address: dummyAddr } = deriveLiquidAddressAndKey(xpub, blindKey, 0);

    const preview = await getPreviewQuote({
      depositAssetId,
      settleAssetId,
      sendAmountSats,
      receiveAddress: dummyAddr,
      changeAddress:  dummyAddr,
    });

    // For depositIsBase=false (user sells Quote=e.g. DePix, buys Base=e.g. USDT):
    //   sendSats ≈ quoteAmount (DePix sats)
    //   receiveSats = baseAmount (USDT sats — what taker receives from makers)
    // For depositIsBase=true (user sells Base, buys Quote):
    //   sendSats ≈ baseAmount
    //   receiveSats = quoteAmount
    const { depositIsBase, baseAmount, quoteAmount, serverFee, fixedFee, feeAsset } = preview;

    const sendSats         = depositIsBase ? baseAmount  : quoteAmount;
    const receiveGrossSats = depositIsBase ? quoteAmount : baseAmount;
    const totalFeeSats     = serverFee + fixedFee;

    const feeInReceiveAsset =
      (feeAsset === 'Base'  && !depositIsBase) ||
      (feeAsset === 'Quote' &&  depositIsBase);
    const receiveNetSats = feeInReceiveAsset
      ? receiveGrossSats - totalFeeSats
      : receiveGrossSats;

    const feeAssetTicker = feeAsset === 'Base'
      ? (depositIsBase ? depositAsset.toUpperCase() : settleAsset.toUpperCase())
      : (depositIsBase ? settleAsset.toUpperCase()  : depositAsset.toUpperCase());

    const platformPercent  = parseFloat(process.env.SWAP_MARGIN_PERCENT || '0');
    const sideswapPercent  = sendSats > 0 ? (serverFee / sendSats) * 100 : 0;
    const serviceFeePercent = parseFloat((platformPercent + sideswapPercent).toFixed(2));

    return res.json({
      depositAsset: depositAsset.toUpperCase(),
      settleAsset:  settleAsset.toUpperCase(),
      sendAmount:       sendSats        / 1e8,
      receiveAmount:    receiveNetSats  / 1e8,
      fixedFeeAmount:   fixedFee        / 1e8,
      feeAsset:         feeAssetTicker,
      serviceFeePercent,
      rate: sendSats > 0 ? receiveNetSats / sendSats : 0,
      testnet: IS_TESTNET,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao obter cotação.';
    console.error('[SideSwap] previewQuote:', msg);
    return res.status(502).json({ error: msg });
  }
}

// ─── POST /sideswap/quote ─────────────────────────────────────────────────────

export async function createQuote(req: Request, res: Response) {
  if (!isSideSwapConfigured()) return notConfigured(res);

  const { depositAsset, settleAsset, settleAddress, amount } = req.body as {
    depositAsset: string;
    settleAsset: string;
    settleAddress: string;
    amount?: number;
  };

  if (!depositAsset || !settleAsset || !settleAddress) {
    return res.status(400).json({ error: 'depositAsset, settleAsset e settleAddress são obrigatórios.' });
  }

  const xpub      = process.env.SIDESWAP_LIQUID_XPUB || '';
  const blindKey  = process.env.LIQUID_MASTER_BLINDING_KEY || '';

  if (!xpub || !blindKey) {
    return res.status(503).json({ error: 'Carteira SideSwap não configurada (SIDESWAP_LIQUID_XPUB / LIQUID_MASTER_BLINDING_KEY ausentes).' });
  }

  try {
    const uid = userId(req);
    const index = await getNextAddressIndex(prisma);
    const { address } = deriveLiquidAddressAndKey(xpub, blindKey, index);

    const swap = await prisma.sideswapSwap.create({
      data: {
        userId: uid,
        status: 'pending_deposit',
        depositAsset: depositAsset.toUpperCase(),
        settleAsset: settleAsset.toUpperCase(),
        settleAddress,
        depositAddress: address,
        depositAmount: amount ? String(amount) : undefined,
      },
    });

    await logSwapEvent(swap.id, 'created', 'pending_deposit', { depositAsset, settleAsset, settleAddress });

    return res.status(201).json({
      swapId: swap.id,
      depositAddress: address,
      depositAsset: swap.depositAsset,
      settleAsset: swap.settleAsset,
      status: swap.status,
      testnet: IS_TESTNET,
      ...(IS_TESTNET && { warning: 'Testnet — valores de teste apenas' }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao criar swap.';
    console.error('[SideSwap] createQuote:', msg);
    return res.status(500).json({ error: msg });
  }
}

// ─── GET /sideswap/swaps ─────────────────────────────────────────────────────

export async function listSwaps(req: Request, res: Response) {
  const uid = userId(req);
  const swaps = await prisma.sideswapSwap.findMany({
    where: { userId: uid },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      status: true,
      depositAsset: true,
      settleAsset: true,
      depositAmount: true,
      settleAmount: true,
      depositAddress: true,
      depositTxid: true,
      settleTxid: true,
      errorMessage: true,
      refundAddress: true,
      refundRequestAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return res.json({ swaps, testnet: IS_TESTNET });
}

// ─── GET /sideswap/swap/:id ───────────────────────────────────────────────────

export async function getSwap(req: Request, res: Response) {
  const id = String(req.params.id);
  const uid = userId(req);

  // Fix 6: ownership enforced — WHERE id AND userId
  const swap = await prisma.sideswapSwap.findFirst({
    where: { id, userId: uid },
  });

  if (!swap) return res.status(404).json({ error: 'Swap não encontrado.' });

  return res.json({
    id: swap.id,
    status: swap.status,
    depositAsset: swap.depositAsset,
    settleAsset: swap.settleAsset,
    depositAmount: swap.depositAmount,
    settleAmount: swap.settleAmount,
    depositAddress: swap.depositAddress,
    depositTxid: swap.depositTxid,
    settleTxid: swap.settleTxid,
    errorMessage: swap.errorMessage,
    createdAt: swap.createdAt,
    updatedAt: swap.updatedAt,
    testnet: IS_TESTNET,
  });
}

// ─── POST /sideswap/confirm/:id ───────────────────────────────────────────────

export async function confirmSwap(req: Request, res: Response) {
  if (!isSideSwapConfigured()) return notConfigured(res);

  const id = String(req.params.id);
  const uid = userId(req);

  // Fix 6: ownership enforced — WHERE id AND userId
  const swap = await prisma.sideswapSwap.findFirst({
    where: { id, userId: uid },
  });

  if (!swap) return res.status(404).json({ error: 'Swap não encontrado.' });
  if (swap.status !== 'pending_deposit') {
    return res.status(409).json({ error: `Swap status inválido para confirmação: ${swap.status}` });
  }

  const xpub     = process.env.SIDESWAP_LIQUID_XPUB || '';
  const blindKey = process.env.LIQUID_MASTER_BLINDING_KEY || '';

  if (!xpub || !blindKey || !swap.depositAddress) {
    return res.status(503).json({ error: 'Configuração incompleta.' });
  }

  res.json({ status: 'broadcasting', swapId: swap.id });

  processSwap(swap, uid, xpub, blindKey).catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SideSwap] processSwap ${id} failed:`, msg);

    // Deposit not yet confirmed — keep pending so user can retry after confirmations
    const notDetected = /não detectado|not detected|not found.*utxo|utxo.*not found/i.test(msg);
    if (notDetected) {
      await prisma.sideswapSwap.update({
        where: { id: swap.id },
        data: { status: 'pending_deposit', errorMessage: null, updatedAt: new Date() },
      }).catch(() => {});
      return;
    }

    await prisma.sideswapSwap.update({
      where: { id: swap.id },
      data: { status: 'failed', errorMessage: msg, updatedAt: new Date() },
    }).catch(() => {});
    await logSwapEvent(swap.id, swap.status, 'failed', { error: msg }).catch(() => {});
    notifySwapFailed(uid, swap.depositAsset, swap.settleAsset).catch(() => {});
  });
}

async function processSwap(
  swap: { id: string; depositAddress: string | null; depositAsset: string; settleAsset: string; settleAddress: string; depositAmount: any; status: string },
  userId: string,
  xpub: string,
  blindKey: string,
) {
  if (!swap.depositAddress) throw new Error('Swap sem depositAddress');

  const depositAssetId = resolveAssetId(swap.depositAsset);
  if (!depositAssetId) throw new Error(`Asset não suportado: ${swap.depositAsset}`);

  const maxIndex = await getNextAddressIndex(prisma);
  let blindingPrivKey: Buffer | null = null;
  let foundIndex = -1;

  for (let i = 0; i <= maxIndex; i++) {
    const { address, blindingPrivKey: bpk } = deriveLiquidAddressAndKey(xpub, blindKey, i);
    if (address === swap.depositAddress) {
      blindingPrivKey = bpk;
      foundIndex = i;
      break;
    }
  }

  if (!blindingPrivKey) throw new Error('Não foi possível encontrar chave para depositAddress');

  const expectedUnits = swap.depositAmount
    ? Math.round(Number(swap.depositAmount) * 1e8)
    : 0;

  if (expectedUnits <= 0) throw new Error('depositAmount inválido');

  const txid = await checkEsploraForAssetPayment(
    swap.depositAddress,
    expectedUnits,
    depositAssetId,
    blindingPrivKey,
  );

  if (!txid) throw new Error('Depósito ainda não detectado na rede Liquid');

  await prisma.sideswapSwap.update({
    where: { id: swap.id },
    data: { status: 'broadcasting', depositTxid: txid, updatedAt: new Date() },
  });
  await logSwapEvent(swap.id, swap.status, 'broadcasting', { depositTxid: txid });

  const txRes = await fetch(`${ESPLORA_BASE}/tx/${txid}/hex`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!txRes.ok) throw new Error(`Esplora tx fetch failed: ${txRes.status}`);
  const txHex = await txRes.text();
  const tx = liquid.Transaction.fromHex(txHex);

  const utxoRes = await fetch(`${ESPLORA_BASE}/address/${swap.depositAddress}/utxo`, {
    signal: AbortSignal.timeout(10_000),
  });
  const utxos = await utxoRes.json() as Array<{ txid: string; vout: number }>;
  const utxoMeta = utxos.find(u => u.txid === txid);
  if (!utxoMeta) throw new Error('UTXO não encontrado na listagem Esplora');

  const zkp = await (async () => {
    const { default: initZkp } = await import('@vulpemventures/secp256k1-zkp');
    return initZkp();
  })();
  const conf = new liquid.confidential.Confidential(zkp as any);
  const out = tx.outs[utxoMeta.vout];

  const unblinded = conf.unblindOutputWithKey(out, blindingPrivKey);
  // SideSwap expects blinding factors in reversed byte order vs liquidjs-lib
  const asset_bf = Buffer.from((unblinded as any).assetBlindingFactor).reverse().toString('hex');
  const value_bf = Buffer.from((unblinded as any).valueBlindingFactor).reverse().toString('hex');

  const settleAssetId = resolveAssetId(swap.settleAsset);
  if (!settleAssetId) throw new Error(`Settle asset não suportado: ${swap.settleAsset}`);

  const fullAmountSats  = Number(unblinded.value);
  const swapMargin      = parseFloat(process.env.SWAP_MARGIN_PERCENT || '0') / 100;
  const marginSats      = Math.floor(fullAmountSats * swapMargin);
  const sendAmountSats  = fullAmountSats - marginSats;

  if (marginSats > 0) {
    console.log(`[SideSwap] margin ${marginSats} sats (${(swapMargin * 100).toFixed(2)}%) retained in changeAddress`);
    await logSwapEvent(swap.id, 'broadcasting', 'broadcasting', {
      marginSats,
      sendAmountSats,
      fullAmountSats,
    });
  }

  const utxoPayload = {
    txid,
    vout: utxoMeta.vout,
    asset: depositAssetId,
    asset_bf,
    value: fullAmountSats,
    value_bf,
    redeem_script: null,
  };

  const quoteResult = await getQuote({
    depositAssetId,
    settleAssetId,
    sendAmount: sendAmountSats,
    receiveAddress: swap.settleAddress,
    changeAddress: swap.depositAddress,
    utxos: [utxoPayload],
  });

  // depositIsBase=true → user sent Base, receives Quote; depositIsBase=false → sent Quote, receives Base
  const settleAmountSats = quoteResult.depositIsBase ? quoteResult.quoteAmount : quoteResult.baseAmount;

  await prisma.sideswapSwap.update({
    where: { id: swap.id },
    data: {
      rawQuote: quoteResult as any,
      settleAmount: String(settleAmountSats / 1e8),
      updatedAt: new Date(),
    },
  });
  await logSwapEvent(swap.id, 'broadcasting', 'signing', {
    quoteId: quoteResult.quoteId,
    quoteAmount: quoteResult.quoteAmount,
    serverFee: quoteResult.serverFee,
  });

  const coinType = IS_TESTNET ? 1 : 1776;
  const derivationPath = `m/84'/${coinType}'/0'/0/${foundIndex}`;

  await signAndBroadcast(quoteResult.psetBase64, quoteResult.quoteId, swap.id, [derivationPath], {
    txid,
    vout: utxoMeta.vout,
    prevout: tx.outs[utxoMeta.vout] as unknown as Record<string, unknown>,
  });
  await logSwapEvent(swap.id, 'signing', 'completed', { settleTxid: 'see sideswap_swaps' });

  const settleDisplay = (settleAmountSats / 1e8).toFixed(8).replace(/\.?0+$/, '');
  notifySwapCompleted(userId, swap.depositAsset, swap.settleAsset, settleDisplay).catch(() => {});
}

// ─── POST /sideswap/refund/:id ────────────────────────────────────────────────

export async function requestRefund(req: Request, res: Response) {
  const userId = (req as any).user?.id as string;
  const swapId = req.params.id as string;
  const { refundAddress } = req.body as { refundAddress?: string };

  if (!refundAddress?.trim()) {
    return res.status(400).json({ error: 'Endereço de reembolso obrigatório.' });
  }

  const swap = await prisma.sideswapSwap.findUnique({ where: { id: swapId } });

  if (!swap || swap.userId !== userId) {
    return res.status(404).json({ error: 'Swap não encontrado.' });
  }

  if (swap.status !== 'failed') {
    return res.status(400).json({ error: 'Reembolso só é possível para swaps com status "failed".' });
  }

  if (swap.refundAddress) {
    return res.status(400).json({ error: 'Reembolso já solicitado para este swap.' });
  }

  await prisma.sideswapSwap.update({
    where: { id: swapId },
    data: { refundAddress: refundAddress.trim(), refundRequestAt: new Date() },
  });

  const rawChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (rawChatId) {
    const adminChatId = parseInt(rawChatId, 10);
    const amount = swap.depositAmount ? `${swap.depositAmount} ${swap.depositAsset}` : swap.depositAsset;
    const msg = [
      `⚠️ *Solicitação de reembolso — SideSwap*`,
      `Swap ID: \`${swap.id}\``,
      `Usuário: \`${userId}\``,
      `Valor: ${amount}`,
      `Endereço: \`${refundAddress.trim()}\``,
      `Erro: ${swap.errorMessage || 'sem detalhe'}`,
    ].join('\n');
    sendTelegramMessage(adminChatId, msg, { parse_mode: 'Markdown' }).catch(() => {});
  }

  return res.json({ ok: true, message: 'Solicitação de reembolso registrada. Entraremos em contato.' });
}
