"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hmacValidator_1 = require("../middlewares/hmacValidator");
const webhookController_1 = require("../controllers/webhookController");
const router = (0, express_1.Router)();
/**
 * POST /depixcore/webhook
 * Recebe eventos do PagDepix.
 * Validado por HMAC-SHA256 antes de processar.
 */
router.post('/', hmacValidator_1.hmacValidator, webhookController_1.receiveWebhook);
/**
 * GET /depixcore/webhook/status
 * Health check para o PagDepix verificar conectividade.
 * Não requer autenticação.
 */
router.get('/status', webhookController_1.webhookStatus);
exports.default = router;
//# sourceMappingURL=webhookRoutes.js.map