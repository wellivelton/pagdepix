import { Router } from 'express';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import {
  getDashboardSummary,
  getDashboardMonthly,
  getDailyAggregations,
  getMonthlyDetailHandler,
} from '../controllers/dashboardController';

const router = Router();

// Todas as rotas do dashboard exigem JWT ou API Key
router.use(jwtMiddleware);

/**
 * GET /depixcore/dashboard/summary
 * Métricas consolidadas (total ou por período).
 * Query: startDate, endDate, sandbox
 */
router.get('/summary', getDashboardSummary);

/**
 * GET /depixcore/dashboard/monthly
 * Métricas agrupadas por mês.
 * Query: months (padrão: 12, max: 60)
 */
router.get('/monthly', getDashboardMonthly);

/**
 * GET /depixcore/dashboard/monthly-detail?month=YYYY-MM
 * Detalhamento mensal para DAS: receita bruta, custos Eueln, receita líquida, por faixa.
 */
router.get('/monthly-detail', getMonthlyDetailHandler);

/**
 * GET /depixcore/dashboard/daily
 * Agregações diárias brutas.
 * Query: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get('/daily', getDailyAggregations);

export default router;
