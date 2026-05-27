import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  getMarkets,
  previewQuote,
  createQuote,
  listSwaps,
  getSwap,
  confirmSwap,
  requestRefund,
} from '../controllers/sideswapController';

const router = Router();

router.use(authMiddleware);

router.get('/markets', getMarkets);
router.get('/preview', previewQuote);
router.post('/quote', createQuote);
router.get('/swaps', listSwaps);
router.get('/swap/:id', getSwap);
router.post('/confirm/:id', confirmSwap);
router.post('/refund/:id', requestRefund);

export default router;
