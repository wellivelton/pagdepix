"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwtMiddleware_1 = require("../middlewares/jwtMiddleware");
const dashboardController_1 = require("../controllers/dashboardController");
const router = (0, express_1.Router)();
router.use(jwtMiddleware_1.jwtMiddleware);
/**
 * GET /depixcore/audit/logs
 * Lista logs de auditoria (webhooks recebidos, erros HMAC, etc).
 * Query: page, limit, statusCode, hasError
 */
router.get('/logs', dashboardController_1.listAuditLogs);
exports.default = router;
//# sourceMappingURL=auditRoutes.js.map