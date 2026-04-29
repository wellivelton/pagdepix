import { Router } from 'express';
import { commerceApiKeyAuth } from '../middlewares/commerceApiKeyAuth';
import * as gatewayController from '../controllers/gatewayController';

const router = Router();

router.use(commerceApiKeyAuth);

router.post('/charges', gatewayController.createCharge);
router.get('/charges/:id', gatewayController.getChargeStatus);
router.get('/charges/:id/qr', gatewayController.refreshChargeQr);
router.get('/transactions', gatewayController.listTransactions);

export default router;
