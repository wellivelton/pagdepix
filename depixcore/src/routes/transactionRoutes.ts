import { Router } from 'express';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { listTransactions } from '../controllers/dashboardController';

const router = Router();

// Todas as rotas de transações exigem JWT ou API Key
router.use(jwtMiddleware);

/**
 * GET /depixcore/transactions
 * Lista eventos processados com paginação e filtros.
 * Query: page, limit, eventType, transactionType, isSandbox, startDate, endDate, search
 */
router.get('/', listTransactions);

export default router;
