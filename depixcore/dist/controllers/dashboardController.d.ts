import { Request, Response } from 'express';
/**
 * GET /depixcore/dashboard/summary
 * Retorna métricas consolidadas (total ou por período).
 *
 * Query params:
 *   startDate: ISO date string (opcional)
 *   endDate:   ISO date string (opcional)
 *   sandbox:   'true' para incluir eventos sandbox (padrão: false)
 */
export declare function getDashboardSummary(req: Request, res: Response): Promise<void>;
/**
 * GET /depixcore/dashboard/monthly
 * Retorna métricas agrupadas por mês.
 *
 * Query params:
 *   months: número de meses para retornar (padrão: 12)
 */
export declare function getDashboardMonthly(req: Request, res: Response): Promise<void>;
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
export declare function listTransactions(req: Request, res: Response): Promise<void>;
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
export declare function listAuditLogs(req: Request, res: Response): Promise<void>;
/**
 * GET /depixcore/dashboard/monthly-detail?month=YYYY-MM
 * Detalhamento mensal para geração do DAS (Simples Nacional).
 * Retorna: resumo, por faixa de taxa, por tipo de transação.
 */
export declare function getMonthlyDetailHandler(req: Request, res: Response): Promise<void>;
/**
 * GET /depixcore/dashboard/daily
 * Retorna agregações diárias brutas para um período.
 *
 * Query params:
 *   startDate: YYYY-MM-DD (padrão: 30 dias atrás)
 *   endDate:   YYYY-MM-DD (padrão: hoje)
 */
export declare function getDailyAggregations(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=dashboardController.d.ts.map