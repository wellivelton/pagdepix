import { Request, Response } from 'express';
import { getSummary, getMonthlyBreakdown, getMonthlyDetail } from '../services/aggregationService';
import { prisma } from '../prisma';

/**
 * GET /depixcore/dashboard/summary
 * Retorna métricas consolidadas (total ou por período).
 *
 * Query params:
 *   startDate: ISO date string (opcional)
 *   endDate:   ISO date string (opcional)
 *   sandbox:   'true' para incluir eventos sandbox (padrão: false)
 */
export async function getDashboardSummary(req: Request, res: Response): Promise<void> {
  try {
    const { startDate, endDate, sandbox } = req.query;

    const filters: {
      startDate?: Date;
      endDate?: Date;
      includeSandbox?: boolean;
    } = {};

    if (startDate && typeof startDate === 'string') {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) filters.startDate = d;
    }

    if (endDate && typeof endDate === 'string') {
      const d = new Date(endDate);
      if (!isNaN(d.getTime())) filters.endDate = d;
    }

    if (sandbox === 'true') {
      filters.includeSandbox = true;
    }

    const summary = await getSummary(Object.keys(filters).length > 0 ? filters : undefined);

    res.json({
      ok: true,
      data: summary,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Dashboard] Erro ao buscar summary:', err);
    res.status(500).json({ ok: false, error: 'Erro interno' });
  }
}

/**
 * GET /depixcore/dashboard/monthly
 * Retorna métricas agrupadas por mês.
 *
 * Query params:
 *   months: número de meses para retornar (padrão: 12)
 */
export async function getDashboardMonthly(req: Request, res: Response): Promise<void> {
  try {
    const months = parseInt(String(req.query.months || '12'), 10);
    const safeMonths = isNaN(months) || months < 1 ? 12 : Math.min(months, 60);

    const breakdown = await getMonthlyBreakdown(safeMonths);

    res.json({
      ok: true,
      data: breakdown,
      months: safeMonths,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Dashboard] Erro ao buscar monthly breakdown:', err);
    res.status(500).json({ ok: false, error: 'Erro interno' });
  }
}

/**
 * GET /depixcore/transactions
 * Lista eventos processados com paginação e filtros.
 *
 * Query params:
 *   page:          página (padrão: 1)
 *   limit:         itens por página (padrão: 50, max: 200)
 *   eventType:     filtrar por tipo de evento
 *   transactionType: filtrar por tipo de transação (boleto/recharge/charge)
 *   isSandbox:     'true' para mostrar apenas sandbox
 *   startDate:     ISO date string
 *   endDate:       ISO date string
 *   search:        busca por transactionId ou txid
 */
export async function listTransactions(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (req.query.eventType) {
      where.eventType = String(req.query.eventType);
    }

    if (req.query.transactionType) {
      where.transactionType = String(req.query.transactionType);
    }

    if (req.query.isSandbox === 'true') {
      where.isSandbox = true;
    } else if (req.query.isSandbox === 'false') {
      where.isSandbox = false;
    }

    if (req.query.startDate || req.query.endDate) {
      where.processedAt = {};
      if (req.query.startDate) {
        const d = new Date(String(req.query.startDate));
        if (!isNaN(d.getTime())) where.processedAt.gte = d;
      }
      if (req.query.endDate) {
        const d = new Date(String(req.query.endDate));
        if (!isNaN(d.getTime())) where.processedAt.lte = d;
      }
    }

    if (req.query.search) {
      const search = String(req.query.search).trim();
      where.OR = [
        { transactionId: { contains: search } },
        { txid: { contains: search } },
        { externalRef: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.eventProcessed.count({ where }),
      prisma.eventProcessed.findMany({
        where,
        orderBy: { processedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          rawEventId: true,
          eventType: true,
          transactionType: true,
          transactionId: true,
          txid: true,
          amount: true,
          fee: true,
          totalAmount: true,
          cost: true,
          netProfit: true,
          externalRef: true,
          status: true,
          currency: true,
          cryptoAmount: true,
          exchangeRate: true,
          isSandbox: true,
          eventTimestamp: true,
          processedAt: true,
        },
      }),
    ]);

    res.json({
      ok: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Dashboard] Erro ao listar transações:', err);
    res.status(500).json({ ok: false, error: 'Erro interno' });
  }
}

/**
 * GET /depixcore/audit/logs
 * Lista logs de auditoria (webhooks recebidos, erros HMAC, etc).
 *
 * Query params:
 *   page:       página (padrão: 1)
 *   limit:      itens por página (padrão: 50, max: 200)
 *   statusCode: filtrar por código HTTP (ex: 401, 500)
 *   hasError:   'true' para mostrar apenas entradas com erro
 */
export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (req.query.statusCode) {
      const code = parseInt(String(req.query.statusCode), 10);
      if (!isNaN(code)) where.statusCode = code;
    }

    if (req.query.hasError === 'true') {
      where.error = { not: null };
    }

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          method: true,
          path: true,
          ip: true,
          userAgent: true,
          statusCode: true,
          error: true,
          eventType: true,
          deliveryId: true,
          rawEventId: true,
          createdAt: true,
        },
      }),
    ]);

    res.json({
      ok: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Dashboard] Erro ao listar audit logs:', err);
    res.status(500).json({ ok: false, error: 'Erro interno' });
  }
}

/**
 * GET /depixcore/dashboard/monthly-detail?month=YYYY-MM
 * Detalhamento mensal para geração do DAS (Simples Nacional).
 * Retorna: resumo, por faixa de taxa, por tipo de transação.
 */
export async function getMonthlyDetailHandler(req: Request, res: Response): Promise<void> {
  try {
    // month = YYYY-MM, padrão = mês atual
    const now   = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month : today;

    const detail = await getMonthlyDetail(month);

    res.json({ ok: true, data: detail, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[Dashboard] Erro monthly-detail:', err);
    res.status(500).json({ ok: false, error: 'Erro interno' });
  }
}

/**
 * GET /depixcore/dashboard/daily
 * Retorna agregações diárias brutas para um período.
 *
 * Query params:
 *   startDate: YYYY-MM-DD (padrão: 30 dias atrás)
 *   endDate:   YYYY-MM-DD (padrão: hoje)
 */
export async function getDailyAggregations(req: Request, res: Response): Promise<void> {
  try {
    const today = new Date().toISOString().substring(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .substring(0, 10);

    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : thirtyDaysAgo;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : today;

    const rows = await prisma.dailyAggregation.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });

    res.json({
      ok: true,
      data: rows,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Dashboard] Erro ao buscar daily aggregations:', err);
    res.status(500).json({ ok: false, error: 'Erro interno' });
  }
}
