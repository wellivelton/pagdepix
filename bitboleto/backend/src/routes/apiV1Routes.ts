import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { apiKeyAuth } from '../middlewares/apiKeyAuth';
import { apiRateLimiter, apiRequestLogger } from '../middlewares/apiRateLimiter';
import { prisma } from '../prisma';
import { createBoleto, calculateFee } from '../services/createBoleto';
import { parseBarcodeAmount } from '../services/billPayment';
import { updateBoletoTxid, checkBoletoStatus } from '../services/updateBoletoTxid';
import {
  listMobileOperators,
  createRecharge,
  calculateRechargeWithCoupon,
  getRechargeById,
} from '../services/mobileRecharge';
import {
  calculatePixCopiaColaFeeWithCoupon,
  createPixCopiaCola,
  submitPixCopiaColaTxid,
  getPixCopiaColaById,
} from '../services/pixCopiaCola';
import { getRates } from '../services/exchangeRate';
import { notifyAdmin } from '../services/telegram.service';
import { dispatchWebhook } from '../services/webhookService';
import { autoApproveSandboxBoleto, autoApproveSandboxRecharge, autoApproveSandboxPixCopiaCola } from '../services/sandboxService';
import { checkAbnormalBehavior } from '../services/apiAntifraud';

const router = Router();

router.use(apiKeyAuth);
router.use(apiRateLimiter);
router.use(apiRequestLogger);

function paramStr(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads', 'api-receipts');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// ========================================
// GET /rates — Cotações atuais
// ========================================
router.get('/rates', async (_req: Request, res: Response) => {
  try {
    const rates = await getRates();
    return res.json({
      usdBrl: rates.usdBrl,
      btcBrl: rates.btcBrl,
      btcUsd: rates.btcUsd,
      updatedAt: rates.fetchedAt,
    });
  } catch (err: any) {
    return res.status(503).json({ error: 'Exchange rates unavailable' });
  }
});

// ========================================
// POST /boleto/calculate — Preview de taxa
// ========================================
router.post('/boleto/calculate', async (req: Request, res: Response) => {
  try {
    const { amount, paymentCurrency } = req.body;
    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'amount is required (number)' });
    }
    const result = await calculateFee(Number(amount), undefined, undefined, paymentCurrency);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========================================
// POST /boleto/create — Criar boleto via API
// ========================================
router.post('/boleto/create', async (req: Request, res: Response) => {
  try {
    const { amount, barcode, digitableLine, pdfUrl, pdfPassword, dueDate, paymentCurrency, externalRef } = req.body;
    const apiKey = req.apiKey!;

    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'amount is required (number)' });
    }
    if (!dueDate) {
      return res.status(400).json({ error: 'dueDate is required (ISO 8601)' });
    }

    // Validate barcode or digitableLine if provided
    if (barcode) {
      const parsed = parseBarcodeAmount(String(barcode));
      if (parsed === null) {
        return res.status(400).json({ error: 'barcode inválido ou não reconhecido.' });
      }
    }
    if (digitableLine && !barcode) {
      const parsed = parseBarcodeAmount(String(digitableLine));
      if (parsed === null) {
        return res.status(400).json({ error: 'digitableLine inválida ou não reconhecida.' });
      }
    }

    const affiliate = await prisma.affiliate.findUnique({
      where: { id: apiKey.affiliateId },
      include: { user: true },
    });
    if (!affiliate) {
      return res.status(400).json({ error: 'Affiliate not found' });
    }

    const result = await createBoleto({
      userId: affiliate.userId,
      barcode,
      digitableLine: digitableLine || undefined,
      pdfUrl,
      pdfPassword,
      amount: Number(amount),
      dueDate: new Date(dueDate),
      paymentCurrency: paymentCurrency || 'DEPIX',
    }, req);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await prisma.boleto.update({
      where: { id: result.boleto.id },
      data: {
        apiKeyId: apiKey.apiKeyId,
        externalRef: externalRef || null,
        isSandbox: apiKey.isSandbox,
        affiliateId: affiliate.id,
      },
    });

    // Notificação apenas quando TXID for submetido - evita spam de testes

    checkAbnormalBehavior(apiKey.apiKeyId).catch(() => {});

    return res.status(201).json({
      id: result.boleto.id,
      amount: result.boleto.amount,
      fee: result.boleto.fee,
      totalAmount: result.boleto.totalAmount,
      depixAmount: result.boleto.depixAmount,
      walletAddress: result.boleto.walletAddress,
      qrCode: result.boleto.qrCode,
      status: result.boleto.status,
      paymentCurrency: result.boleto.paymentCurrency,
      exchangeRate: result.boleto.exchangeRate,
      cryptoAmount: result.boleto.cryptoAmount,
      rateLockExpiresAt: result.boleto.rateLockExpiresAt,
      externalRef: externalRef || null,
      isSandbox: apiKey.isSandbox,
      createdAt: result.boleto.createdAt,
    });
  } catch (err: any) {
    console.error('[API v1] boleto/create error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========================================
// POST /boleto/:id/txid — Submeter TXID
// ========================================
router.post('/boleto/:id/txid', async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const { txid } = req.body;
    const apiKey = req.apiKey!;

    if (!txid) {
      return res.status(400).json({ error: 'txid is required' });
    }

    const boleto = await prisma.boleto.findFirst({
      where: { id, apiKeyId: apiKey.apiKeyId },
    });
    if (!boleto) {
      return res.status(404).json({ error: 'Boleto not found' });
    }

    const affiliate = await prisma.affiliate.findUnique({ where: { id: apiKey.affiliateId } });
    if (!affiliate) {
      return res.status(400).json({ error: 'Affiliate not found' });
    }

    const result = await updateBoletoTxid({
      boletoId: id,
      userId: affiliate.userId,
      txid,
      ip: req.ip || 'api',
      userAgent: req.headers['user-agent'] || 'api-client',
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    try {
      await notifyAdmin(
        `💰 *TXID Submetido via API*\nBoleto: \`${id}\`\nTXID: \`${txid}\`\nAfiliado: ${affiliate.couponCode}`
      );
    } catch {}

    dispatchWebhook('payment.received', id, 'boleto', {
      txid,
      amount: boleto.amount,
      totalAmount: boleto.totalAmount,
      status: 'PENDING',
      externalRef: (boleto as any).externalRef,
    }, apiKey.apiKeyId, apiKey.isSandbox).catch(() => {});

    if (apiKey.isSandbox) {
      autoApproveSandboxBoleto(id).catch((err) =>
        console.error('[Sandbox] Auto-approve boleto failed:', err.message)
      );
    }

    return res.json({
      id: result.boleto.id,
      status: result.boleto.status,
      txid: result.boleto.txid,
      paidAt: result.boleto.paidAt,
      message: apiKey.isSandbox
        ? 'TXID submitted. Sandbox: auto-approved.'
        : 'TXID submitted. Awaiting admin confirmation.',
    });
  } catch (err: any) {
    console.error('[API v1] boleto/:id/txid error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========================================
// GET /boleto/:id/status — Status do boleto
// ========================================
router.get('/boleto/:id/status', async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const apiKey = req.apiKey!;

    const boleto = await prisma.boleto.findFirst({
      where: { id, apiKeyId: apiKey.apiKeyId },
      select: {
        id: true,
        amount: true,
        fee: true,
        totalAmount: true,
        status: true,
        txid: true,
        paidAt: true,
        confirmedAt: true,
        receiptUrl: true,
        problemReason: true,
        paymentCurrency: true,
        exchangeRate: true,
        cryptoAmount: true,
        rateLockExpiresAt: true,
        rateExpired: true,
        externalRef: true,
        isSandbox: true,
        createdAt: true,
      },
    });

    if (!boleto) {
      return res.status(404).json({ error: 'Boleto not found' });
    }

    return res.json(boleto);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========================================
// GET /recharge/operators — Lista operadoras
// ========================================
router.get('/recharge/operators', async (_req: Request, res: Response) => {
  const operators = await listMobileOperators();
  return res.json(operators);
});

// ========================================
// POST /recharge/calculate — Preview de taxa
// ========================================
router.post('/recharge/calculate', async (req: Request, res: Response) => {
  try {
    const { amount, paymentCurrency } = req.body;
    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'amount is required (number)' });
    }
    const result = await calculateRechargeWithCoupon(Number(amount), { paymentCurrency });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========================================
// POST /recharge/create — Criar recarga via API
// ========================================
router.post('/recharge/create', async (req: Request, res: Response) => {
  try {
    const { operator, phoneNumber, amount, paymentCurrency, externalRef } = req.body;
    const apiKey = req.apiKey!;

    if (!operator) return res.status(400).json({ error: 'operator is required' });
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });
    if (!amount || isNaN(Number(amount))) return res.status(400).json({ error: 'amount is required (number)' });

    const affiliate = await prisma.affiliate.findUnique({
      where: { id: apiKey.affiliateId },
      include: { user: true },
    });
    if (!affiliate) {
      return res.status(400).json({ error: 'Affiliate not found' });
    }

    const result = await createRecharge({
      userId: affiliate.userId,
      operator,
      phoneNumber,
      amount: Number(amount),
      paymentCurrency: paymentCurrency || 'DEPIX',
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await prisma.mobileRecharge.update({
      where: { id: result.recharge.id },
      data: {
        apiKeyId: apiKey.apiKeyId,
        externalRef: externalRef || null,
        isSandbox: apiKey.isSandbox,
        affiliateId: affiliate.id,
      },
    });

    // Notificação apenas quando TXID for submetido - evita spam de testes

    checkAbnormalBehavior(apiKey.apiKeyId).catch(() => {});

    return res.status(201).json({
      id: result.recharge.id,
      operator: result.recharge.operator,
      phoneNumber: result.recharge.phoneNumber,
      amount: result.recharge.amount,
      fee: result.recharge.fee,
      totalAmount: result.recharge.totalAmount,
      depixAmount: result.recharge.depixAmount,
      walletAddress: result.recharge.walletAddress,
      status: result.recharge.status,
      paymentCurrency: result.recharge.paymentCurrency,
      exchangeRate: result.recharge.exchangeRate,
      cryptoAmount: result.recharge.cryptoAmount,
      rateLockExpiresAt: result.recharge.rateLockExpiresAt,
      externalRef: externalRef || null,
      isSandbox: apiKey.isSandbox,
      createdAt: result.recharge.createdAt,
    });
  } catch (err: any) {
    console.error('[API v1] recharge/create error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========================================
// POST /recharge/:id/txid — Submeter TXID da recarga
// ========================================
router.post('/recharge/:id/txid', async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const { txid } = req.body;
    const apiKey = req.apiKey!;

    if (!txid) {
      return res.status(400).json({ error: 'txid is required' });
    }

    const recharge = await prisma.mobileRecharge.findFirst({
      where: { id, apiKeyId: apiKey.apiKeyId },
    });
    if (!recharge) {
      return res.status(404).json({ error: 'Recharge not found' });
    }

    const affiliate = await prisma.affiliate.findUnique({ where: { id: apiKey.affiliateId } });
    if (!affiliate) {
      return res.status(400).json({ error: 'Affiliate not found' });
    }

    const { updateRechargeTxid } = await import('../services/mobileRecharge');
    const result = await updateRechargeTxid(id, affiliate.userId, txid);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    try {
      await notifyAdmin(
        `💰 *TXID Recarga via API*\nRecarga: \`${id}\`\nTXID: \`${txid}\`\nAfiliado: ${affiliate.couponCode}`
      );
    } catch {}

    dispatchWebhook('payment.received', id, 'recharge', {
      txid,
      amount: recharge.amount,
      totalAmount: recharge.totalAmount,
      status: 'PENDING',
      externalRef: (recharge as any).externalRef,
    }, apiKey.apiKeyId, apiKey.isSandbox).catch(() => {});

    if (apiKey.isSandbox) {
      autoApproveSandboxRecharge(id).catch((err) =>
        console.error('[Sandbox] Auto-approve recharge failed:', err.message)
      );
    }

    return res.json({
      id: result.recharge.id,
      status: result.recharge.status,
      txid: result.recharge.txid,
      message: apiKey.isSandbox
        ? 'TXID submitted. Sandbox: auto-approved.'
        : 'TXID submitted. Awaiting admin confirmation.',
    });
  } catch (err: any) {
    console.error('[API v1] recharge/:id/txid error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========================================
// GET /recharge/:id/status — Status da recarga
// ========================================
router.get('/recharge/:id/status', async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const apiKey = req.apiKey!;

    const recharge = await prisma.mobileRecharge.findFirst({
      where: { id, apiKeyId: apiKey.apiKeyId },
      select: {
        id: true,
        operator: true,
        phoneNumber: true,
        amount: true,
        fee: true,
        totalAmount: true,
        status: true,
        txid: true,
        receiptUrl: true,
        paymentCurrency: true,
        exchangeRate: true,
        cryptoAmount: true,
        rateLockExpiresAt: true,
        rateExpired: true,
        externalRef: true,
        isSandbox: true,
        createdAt: true,
        paidAt: true,
      },
    });

    if (!recharge) {
      return res.status(404).json({ error: 'Recharge not found' });
    }

    return res.json(recharge);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========================================
// POST /boleto/:id/receipt — Upload de comprovante
// ========================================
router.post('/boleto/:id/receipt', upload.single('receipt'), async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const apiKey = req.apiKey!;
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ error: 'receipt file is required' });
    }

    const boleto = await prisma.boleto.findFirst({
      where: { id, apiKeyId: apiKey.apiKeyId },
    });
    if (!boleto) {
      return res.status(404).json({ error: 'Boleto not found' });
    }

    const receiptUrl = `/uploads/api-receipts/${file.filename}`;

    await prisma.boleto.update({
      where: { id },
      data: { receiptUrl },
    });

    return res.json({ id, receiptUrl, message: 'Receipt uploaded successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========================================
// POST /recharge/:id/receipt — Upload de comprovante
// ========================================
router.post('/recharge/:id/receipt', upload.single('receipt'), async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const apiKey = req.apiKey!;
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ error: 'receipt file is required' });
    }

    const recharge = await prisma.mobileRecharge.findFirst({
      where: { id, apiKeyId: apiKey.apiKeyId },
    });
    if (!recharge) {
      return res.status(404).json({ error: 'Recharge not found' });
    }

    const receiptUrl = `/uploads/api-receipts/${file.filename}`;

    await prisma.mobileRecharge.update({
      where: { id },
      data: { receiptUrl },
    });

    return res.json({ id, receiptUrl, message: 'Receipt uploaded successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========================================
// GET /transactions — Listar transações da API key
// ========================================
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const apiKey = req.apiKey!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;

    const boletoWhere: any = { apiKeyId: apiKey.apiKeyId };
    const rechargeWhere: any = { apiKeyId: apiKey.apiKeyId };
    const pccWhere: any = { apiKeyId: apiKey.apiKeyId };
    if (status) {
      boletoWhere.status = status;
      rechargeWhere.status = status;
      pccWhere.status = status;
    }

    if (type === 'pix-copia-cola') {
      const [records, total] = await Promise.all([
        (prisma as any).pixCopiaCola.findMany({
          where: pccWhere,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true, codigoPix: true, valorOriginal: true, valorTaxa: true,
            totalFinal: true, nomeDestinatario: true, status: true, txid: true,
            paymentCurrency: true, cryptoAmount: true, externalRef: true,
            isSandbox: true, createdAt: true, processedAt: true,
          },
        }),
        (prisma as any).pixCopiaCola.count({ where: pccWhere }),
      ]);
      return res.json({
        data: records.map((r: any) => ({ ...r, type: 'pix-copia-cola', totalAmount: r.totalFinal, amount: r.valorOriginal })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    if (type === 'recharge') {
      const [recharges, total] = await Promise.all([
        prisma.mobileRecharge.findMany({
          where: rechargeWhere,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true, operator: true, phoneNumber: true, amount: true, fee: true,
            totalAmount: true, status: true, txid: true, paymentCurrency: true,
            externalRef: true, isSandbox: true, createdAt: true, paidAt: true,
          },
        }),
        prisma.mobileRecharge.count({ where: rechargeWhere }),
      ]);
      return res.json({
        data: recharges.map((r) => ({ ...r, type: 'recharge' })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    if (type === 'boleto') {
      const [boletos, total] = await Promise.all([
        prisma.boleto.findMany({
          where: boletoWhere,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true, amount: true, fee: true, totalAmount: true, status: true,
            txid: true, paymentCurrency: true, externalRef: true, isSandbox: true,
            createdAt: true, paidAt: true, confirmedAt: true,
          },
        }),
        prisma.boleto.count({ where: boletoWhere }),
      ]);
      return res.json({
        data: boletos.map((b) => ({ ...b, type: 'boleto' })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    const [boletos, recharges, pixColiaCola, totalBoletos, totalRecharges, totalPcc] = await Promise.all([
      prisma.boleto.findMany({
        where: boletoWhere,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, amount: true, fee: true, totalAmount: true, status: true,
          txid: true, paymentCurrency: true, externalRef: true, isSandbox: true,
          createdAt: true, paidAt: true, confirmedAt: true,
        },
      }),
      prisma.mobileRecharge.findMany({
        where: rechargeWhere,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, operator: true, phoneNumber: true, amount: true, fee: true,
          totalAmount: true, status: true, txid: true, paymentCurrency: true,
          externalRef: true, isSandbox: true, createdAt: true, paidAt: true,
        },
      }),
      (prisma as any).pixCopiaCola.findMany({
        where: pccWhere,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, valorOriginal: true, valorTaxa: true, totalFinal: true,
          nomeDestinatario: true, status: true, txid: true, paymentCurrency: true,
          cryptoAmount: true, externalRef: true, isSandbox: true, createdAt: true, processedAt: true,
        },
      }),
      prisma.boleto.count({ where: boletoWhere }),
      prisma.mobileRecharge.count({ where: rechargeWhere }),
      (prisma as any).pixCopiaCola.count({ where: pccWhere }),
    ]);

    const combined = [
      ...boletos.map((b) => ({ ...b, type: 'boleto' as const })),
      ...recharges.map((r) => ({ ...r, type: 'recharge' as const })),
      ...pixColiaCola.map((p: any) => ({ ...p, type: 'pix-copia-cola' as const, amount: p.valorOriginal, totalAmount: p.totalFinal })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(skip, skip + limit);

    const total = totalBoletos + totalRecharges + totalPcc;
    return res.json({
      data: combined,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========================================
// PIX COPIA E COLA — WHITE-LABEL
// ========================================
router.post('/pix-copia-cola/calculate', async (req: Request, res: Response) => {
  try {
    const apiKey = (req as any).apiKey;
    const { valorOriginal, couponCode, paymentCurrency } = req.body;
    const result = await calculatePixCopiaColaFeeWithCoupon(Number(valorOriginal), {
      couponCode,
      paymentCurrency,
    });
    if (!result.isValid) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/pix-copia-cola/create', async (req: Request, res: Response) => {
  try {
    const apiKey = (req as any).apiKey;
    const {
      codigoPix, valorOriginal, nomeDestinatario,
      contatoTelegram, contatoEmail, contatoWhatsApp,
      couponCode, paymentCurrency, externalRef,
    } = req.body;

    const affiliate = await prisma.affiliate.findUnique({ where: { id: apiKey.affiliateId } });
    if (!affiliate) return res.status(403).json({ error: 'Afiliado não encontrado.' });

    const result = await createPixCopiaCola({
      userId: affiliate.userId,
      codigoPix,
      valorOriginal: Number(valorOriginal),
      nomeDestinatario,
      contatoTelegram,
      contatoEmail,
      contatoWhatsApp,
      couponCode,
      paymentCurrency,
      apiKeyId: apiKey.apiKeyId,
      affiliateId: apiKey.affiliateId,
      externalRef,
      isSandbox: apiKey.isSandbox,
    });
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.status(201).json(result.pixCopiaCola);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.put('/pix-copia-cola/:id/txid', async (req: Request, res: Response) => {
  try {
    const apiKey = (req as any).apiKey;
    const { txid } = req.body;
    const record = await (prisma as any).pixCopiaCola.findFirst({
      where: { id: req.params.id, apiKeyId: apiKey.apiKeyId }
    });
    if (!record) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    const result = await submitPixCopiaColaTxid(String(req.params.id), record.userId, String(txid));
    if (!result.success) return res.status(400).json({ error: result.error });

    dispatchWebhook('pix.received', record.id, 'pix-copia-cola', {
      txid: String(txid),
      valorOriginal: record.valorOriginal,
      valorTaxa: record.valorTaxa,
      totalFinal: record.totalFinal,
      nomeDestinatario: record.nomeDestinatario,
      paymentCurrency: record.paymentCurrency,
      status: 'TXID_SUBMITTED',
      externalRef: record.externalRef,
    }, apiKey.apiKeyId, apiKey.isSandbox).catch(() => {});

    if (apiKey.isSandbox) {
      autoApproveSandboxPixCopiaCola(record.id).catch((err: any) =>
        console.error('[Sandbox] Auto-approve pix-copia-cola failed:', err.message)
      );
    }

    return res.json(result.pixCopiaCola);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/pix-copia-cola/:id', async (req: Request, res: Response) => {
  try {
    const apiKey = (req as any).apiKey;
    const record = await (prisma as any).pixCopiaCola.findFirst({
      where: { id: req.params.id, apiKeyId: apiKey.apiKeyId }
    });
    if (!record) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    return res.json(record);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
