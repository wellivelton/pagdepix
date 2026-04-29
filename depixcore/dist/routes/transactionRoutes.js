"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwtMiddleware_1 = require("../middlewares/jwtMiddleware");
const dashboardController_1 = require("../controllers/dashboardController");
const router = (0, express_1.Router)();
// Todas as rotas de transações exigem JWT ou API Key
router.use(jwtMiddleware_1.jwtMiddleware);
/**
 * GET /depixcore/transactions
 * Lista eventos processados com paginação e filtros.
 * Query: page, limit, eventType, transactionType, isSandbox, startDate, endDate, search
 */
router.get('/', dashboardController_1.listTransactions);
exports.default = router;
//# sourceMappingURL=transactionRoutes.js.map