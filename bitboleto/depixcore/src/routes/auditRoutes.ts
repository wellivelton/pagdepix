import { Router } from 'express';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { listAuditLogs } from '../controllers/dashboardController';

const router = Router();

router.use(jwtMiddleware);

/**
 * GET /depixcore/audit/logs
 * Lista logs de auditoria (webhooks recebidos, erros HMAC, etc).
 * Query: page, limit, statusCode, hasError
 */
router.get('/logs', listAuditLogs);

export default router;
