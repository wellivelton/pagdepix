import { Router } from 'express';
import { commerceApiKeyAuth } from '../middlewares/commerceApiKeyAuth';
import * as commerceApiController from '../controllers/commerceApiController';

const router = Router();

router.use(commerceApiKeyAuth);

router.post('/charges', commerceApiController.createCharge);
router.get('/charges/:chargeId', commerceApiController.getChargeStatus);
router.post('/links', commerceApiController.createLink);
router.get('/transactions', commerceApiController.listTransactions);

export default router;
