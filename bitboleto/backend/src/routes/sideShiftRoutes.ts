import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  listCoins,
  fetchPair,
  createQuote,
  createFixed,
  createVariable,
  fetchShift,
} from '../controllers/sideShiftController';

const router = Router();

// All SideShift routes require authentication
router.use(authMiddleware);

router.get('/coins', listCoins);
router.get('/pair', fetchPair);
router.post('/quote', createQuote);
router.post('/shift/fixed', createFixed);
router.post('/shift/variable', createVariable);
router.get('/shift/:id', fetchShift);

export default router;
