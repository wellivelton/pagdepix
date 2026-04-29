import { Request, Response } from 'express';
import * as returnRequestService from '../../services/marketplace/returnRequest.service';

export const requestReturn = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { sellerOrderId, orderItemId, reason } = req.body || {};
  if (!sellerOrderId || !reason) return res.status(400).json({ error: 'sellerOrderId e reason obrigatórios' });
  try {
    const rr = await returnRequestService.requestReturn({
      sellerOrderId,
      orderItemId: orderItemId || undefined,
      reason: String(reason),
      requestedBy: userId,
    });
    return res.status(201).json(rr);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Erro ao solicitar devolução' });
  }
};

export const approveReturn = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const role = (req as any).userRole;
  const returnId = Array.isArray(req.params.returnId) ? req.params.returnId[0] : req.params.returnId;
  const { refundAmount } = req.body || {};
  if (role !== 'ADMIN') return res.status(403).json({ error: 'Apenas admin pode aprovar' });
  if (!returnId) return res.status(400).json({ error: 'returnId obrigatório' });
  try {
    const result = await returnRequestService.approveReturn({
      returnId,
      approvedBy: userId,
      refundAmount: typeof refundAmount === 'number' ? refundAmount : undefined,
    });
    return res.json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Erro ao aprovar devolução' });
  }
};
