import { Router } from 'express';
import { hmacValidator } from '../middlewares/hmacValidator';
import { receiveWebhook, webhookStatus } from '../controllers/webhookController';

const router = Router();

/**
 * POST /depixcore/webhook
 * Recebe eventos do PagDepix.
 * Validado por HMAC-SHA256 antes de processar.
 */
router.post('/', hmacValidator, receiveWebhook);

/**
 * GET /depixcore/webhook/status
 * Health check para o PagDepix verificar conectividade.
 * Não requer autenticação.
 */
router.get('/status', webhookStatus);

export default router;
