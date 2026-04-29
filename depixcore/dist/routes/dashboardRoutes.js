"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwtMiddleware_1 = require("../middlewares/jwtMiddleware");
const dashboardController_1 = require("../controllers/dashboardController");
const router = (0, express_1.Router)();
// Todas as rotas do dashboard exigem JWT ou API Key
router.use(jwtMiddleware_1.jwtMiddleware);
/**
 * GET /depixcore/dashboard/summary
 * Métricas consolidadas (total ou por período).
 * Query: startDate, endDate, sandbox
 */
router.get('/summary', dashboardController_1.getDashboardSummary);
/**
 * GET /depixcore/dashboard/monthly
 * Métricas agrupadas por mês.
 * Query: months (padrão: 12, max: 60)
 */
router.get('/monthly', dashboardController_1.getDashboardMonthly);
/**
 * GET /depixcore/dashboard/monthly-detail?month=YYYY-MM
 * Detalhamento mensal para DAS: receita bruta, custos Eueln, receita líquida, por faixa.
 */
router.get('/monthly-detail', dashboardController_1.getMonthlyDetailHandler);
/**
 * GET /depixcore/dashboard/daily
 * Agregações diárias brutas.
 * Query: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get('/daily', dashboardController_1.getDailyAggregations);
exports.default = router;
//# sourceMappingURL=dashboardRoutes.js.map