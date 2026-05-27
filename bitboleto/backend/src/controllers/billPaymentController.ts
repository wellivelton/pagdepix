import { Request, Response } from 'express';
import {
  previewBillPayment,
  createBillPayment,
  updateBillPaymentTxid,
  listUserBillPayments,
  getBillPaymentById,
  adminListBillPayments,
  adminApproveBillPayment,
  adminRejectBillPayment,
  parseBarcodeAmount,
} from '../services/billPayment';
import { getSafeErrorMessage } from '../utils/safeError';

function parseBrl(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const s = String(val ?? '').trim();
  const n = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return parseFloat(n) || NaN;
}

export async function previewBillPaymentHandler(req: Request, res: Response) {
  try {
    const { amount, couponCode, paymentCurrency, barcode, digitableLine } = req.body;
    const userId = (req as any).userId as string;

    const numAmount = parseBrl(amount);
    if (!Number.isFinite(numAmount)) return res.status(400).json({ error: 'Valor inválido.' });

    const result = await previewBillPayment(numAmount, {
      couponCode,
      userId,
      userIp: req.ip,
      deviceFingerprint: req.headers['x-device-fingerprint'] as string,
      paymentCurrency,
    });

    if (!result.isValid) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: getSafeErrorMessage(e, 'Erro ao calcular taxa.') });
  }
}

export async function parseBarcodeHandler(req: Request, res: Response) {
  try {
    const { barcode, digitableLine } = req.body;
    const code = barcode || digitableLine;
    if (!code) return res.status(400).json({ error: 'Código de barras obrigatório.' });

    const localAmount = parseBarcodeAmount(String(code));
    if (localAmount) return res.json({ amount: localAmount, source: 'local' });

    return res.status(422).json({ error: 'Não foi possível identificar o valor automaticamente. Informe o valor manualmente.', manualRequired: true });
  } catch (e) {
    return res.status(500).json({ error: getSafeErrorMessage(e, 'Erro ao processar código de barras.') });
  }
}

export async function createBillPaymentHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string;
    const {
      barcode, digitableLine, amount, couponCode, paymentCurrency,
    } = req.body;

    const numAmount = parseBrl(amount);
    if (!Number.isFinite(numAmount)) return res.status(400).json({ error: 'Valor inválido.' });

    const result = await createBillPayment({
      userId,
      barcode,
      digitableLine,
      amount: numAmount,
      couponCode,
      userIp: req.ip,
      deviceFingerprint: req.headers['x-device-fingerprint'] as string,
      paymentCurrency: paymentCurrency ?? 'DEPIX',
    });

    if (!result.success) return res.status(400).json({ error: result.error });
    return res.status(201).json(result.billPayment);
  } catch (e) {
    return res.status(500).json({ error: getSafeErrorMessage(e, 'Erro ao criar pagamento.') });
  }
}

export async function listBillPaymentsHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string;
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const limit = parseInt(String(req.query.limit ?? '20'), 10);
    const status = req.query.status as string | undefined;

    const result = await listUserBillPayments(userId, { status, page, limit });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: getSafeErrorMessage(e, 'Erro ao listar pagamentos.') });
  }
}

export async function getBillPaymentHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string;
    const id = String(req.params.id);

    const bp = await getBillPaymentById(id, userId);
    if (!bp) return res.status(404).json({ error: 'Pagamento não encontrado.' });
    return res.json(bp);
  } catch (e) {
    return res.status(500).json({ error: getSafeErrorMessage(e, 'Erro ao buscar pagamento.') });
  }
}

export async function submitTxidHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string;
    const id = String(req.params.id);
    const { txid } = req.body;

    if (!txid) return res.status(400).json({ error: 'TXID obrigatório.' });

    const result = await updateBillPaymentTxid(id, userId, txid);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result.billPayment);
  } catch (e) {
    return res.status(500).json({ error: getSafeErrorMessage(e, 'Erro ao registrar TXID.') });
  }
}

// Admin handlers
export async function adminListBillPaymentsHandler(req: Request, res: Response) {
  try {
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const limit = parseInt(String(req.query.limit ?? '50'), 10);
    const status = req.query.status as string | undefined;

    const result = await adminListBillPayments({ status, page, limit });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: getSafeErrorMessage(e, 'Erro ao listar pagamentos.') });
  }
}

export async function adminApproveBillPaymentHandler(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const result = await adminApproveBillPayment(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result.billPayment);
  } catch (e) {
    return res.status(500).json({ error: getSafeErrorMessage(e, 'Erro ao aprovar pagamento.') });
  }
}

export async function adminRejectBillPaymentHandler(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const result = await adminRejectBillPayment(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result.billPayment);
  } catch (e) {
    return res.status(500).json({ error: getSafeErrorMessage(e, 'Erro ao rejeitar pagamento.') });
  }
}


