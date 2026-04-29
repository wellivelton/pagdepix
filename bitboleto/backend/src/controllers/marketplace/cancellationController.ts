import { Request, Response } from 'express';
import * as orderCancellationService from '../../services/marketplace/orderCancellation.service';

export const requestCancellation = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { marketOrderId, reason } = req.body || {};
  if (!marketOrderId || !reason) return res.status(400).json({ error: 'marketOrderId e reason obrigatórios' });
  try {
    const cancel = await orderCancellationService.requestCancellation({
      marketOrderId,
      requestedBy: userId,
      reason: String(reason),
    });
    return res.status(201).json(cancel);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Erro ao solicitar cancelamento' });
  }
};

export const approveCancellation = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const role = (req as any).userRole;
  const cancellationId = Array.isArray(req.params.cancellationId) ? req.params.cancellationId[0] : req.params.cancellationId;
  const { refundAmount } = req.body || {};
  if (role !== 'ADMIN') return res.status(403).json({ error: 'Apenas admin pode aprovar' });
  if (!cancellationId) return res.status(400).json({ error: 'cancellationId obrigatório' });
  try {
    const result = await orderCancellationService.approveCancellation({
      cancellationId,
      approvedBy: userId,
      refundAmount: typeof refundAmount === 'number' ? refundAmount : undefined,
    });
    return res.json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Erro ao aprovar cancelamento' });
  }
};
