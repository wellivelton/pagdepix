import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireAdmin } from '../middlewares/adminMiddleware';
import {
  previewBillPaymentHandler,
  parseBarcodeHandler,
  createBillPaymentHandler,
  listBillPaymentsHandler,
  getBillPaymentHandler,
  submitTxidHandler,
  adminListBillPaymentsHandler,
  adminApproveBillPaymentHandler,
  adminRejectBillPaymentHandler,
} from '../controllers/billPaymentController';

const router = Router();

// User endpoints
router.post('/preview', authMiddleware, previewBillPaymentHandler);
router.post('/parse-barcode', authMiddleware, parseBarcodeHandler);
router.post('/', authMiddleware, createBillPaymentHandler);
router.get('/', authMiddleware, listBillPaymentsHandler);
router.get('/:id', authMiddleware, getBillPaymentHandler);
router.post('/:id/txid', authMiddleware, submitTxidHandler);

// Admin endpoints
router.get('/admin/list', authMiddleware, requireAdmin, adminListBillPaymentsHandler);
router.post('/admin/:id/approve', authMiddleware, requireAdmin, adminApproveBillPaymentHandler);
router.post('/admin/:id/reject', authMiddleware, requireAdmin, adminRejectBillPaymentHandler);

export default router;
