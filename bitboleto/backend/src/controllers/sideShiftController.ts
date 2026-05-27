import { Request, Response } from 'express';
import {
  sideshiftConfigured,
  getCoins,
  getPair,
  requestQuote,
  createFixedShift,
  createVariableShift,
  getShift,
} from '../services/sideshift.service';

function userIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    ''
  );
}

function notConfigured(res: Response) {
  return res.status(503).json({ error: 'Serviço de swap não configurado.' });
}

export async function listCoins(req: Request, res: Response) {
  if (!sideshiftConfigured()) return notConfigured(res);
  try {
    const coins = await getCoins();
    return res.json({ coins });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar moedas.';
    console.error('[SideShift] listCoins:', msg);
    return res.status(502).json({ error: msg });
  }
}

export async function fetchPair(req: Request, res: Response) {
  if (!sideshiftConfigured()) return notConfigured(res);
  const { from, to, amount } = req.query as Record<string, string>;
  if (!from || !to) return res.status(400).json({ error: 'from e to são obrigatórios.' });
  try {
    const pair = await getPair(from, to, amount, userIp(req));
    return res.json(pair);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar par.';
    return res.status(502).json({ error: msg });
  }
}

export async function createQuote(req: Request, res: Response) {
  if (!sideshiftConfigured()) return notConfigured(res);
  const { depositCoin, depositNetwork, settleCoin, settleNetwork, depositAmount, settleAmount } = req.body;
  if (!depositCoin || !settleCoin) {
    return res.status(400).json({ error: 'depositCoin e settleCoin são obrigatórios.' });
  }
  if (!depositAmount && !settleAmount) {
    return res.status(400).json({ error: 'Informe depositAmount ou settleAmount.' });
  }
  try {
    const quote = await requestQuote(
      { depositCoin, depositNetwork, settleCoin, settleNetwork, depositAmount, settleAmount },
      userIp(req),
    );
    return res.status(201).json(quote);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao criar cotação.';
    return res.status(502).json({ error: msg });
  }
}

export async function createFixed(req: Request, res: Response) {
  if (!sideshiftConfigured()) return notConfigured(res);
  const { quoteId, settleAddress, settleMemo, refundAddress } = req.body;
  if (!quoteId || !settleAddress) {
    return res.status(400).json({ error: 'quoteId e settleAddress são obrigatórios.' });
  }
  const userId = (req as any).userId as string;
  try {
    const shift = await createFixedShift(
      { quoteId, settleAddress, settleMemo, refundAddress, externalId: userId },
      userIp(req),
    );
    return res.status(201).json(shift);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao criar shift fixo.';
    return res.status(502).json({ error: msg });
  }
}

export async function createVariable(req: Request, res: Response) {
  if (!sideshiftConfigured()) return notConfigured(res);
  const { depositCoin, depositNetwork, settleCoin, settleNetwork, settleAddress, settleMemo, refundAddress } = req.body;
  if (!depositCoin || !settleCoin || !settleAddress) {
    return res.status(400).json({ error: 'depositCoin, settleCoin e settleAddress são obrigatórios.' });
  }
  const userId = (req as any).userId as string;
  try {
    const shift = await createVariableShift(
      { depositCoin, depositNetwork, settleCoin, settleNetwork, settleAddress, settleMemo, refundAddress, externalId: userId },
      userIp(req),
    );
    return res.status(201).json(shift);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao criar shift variável.';
    return res.status(502).json({ error: msg });
  }
}

export async function fetchShift(req: Request, res: Response) {
  if (!sideshiftConfigured()) return notConfigured(res);
  const id = req.params.id as string;
  if (!id) return res.status(400).json({ error: 'ID do shift é obrigatório.' });
  try {
    const shift = await getShift(id);
    return res.json(shift);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar shift.';
    return res.status(502).json({ error: msg });
  }
}
