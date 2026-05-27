/**
 * Registra rotas admin com require tardio para evitar "Cannot access before initialization"
 * quando há dependência circular entre routes e adminController.
 */
import { Router, RequestHandler } from 'express';

export default function registerAdminRoutes(
  router: Router,
  protectedRoute: any[],
  upload: any,
  uploadRecharge: any,
  uploadNotification?: any,
  uploadAffiliateReceipts?: any
): void {
  const admin = require('../controllers/adminController');
  const notification = require('../controllers/notificationController');
  const withdrawal = require('../controllers/withdrawalController');
  const affiliate = require('../controllers/affiliateController');
  const support = require('../controllers/supportController');
  const { createApiKey, revokeApiKey, listApiKeys, updateApiKeyIpWhitelist } = require('../services/apiKeyService');
  const { prisma } = require('../prisma');
  const pushService = require('../services/push.service');

  // Garante que o handler seja uma função (evita "argument handler must be a function")
  const h = (fn: unknown, name: string): RequestHandler => {
    if (typeof fn === 'function') return fn as RequestHandler;
    console.warn(`[adminRoutes] Handler ${name} inválido (${typeof fn}), usando fallback`);
    return (_req, res) => res.status(501).json({ error: 'Serviço temporariamente indisponível' });
  };

  router.get('/admin/maintenance', ...protectedRoute, admin.getAdminMaintenance);
  router.post('/admin/maintenance', ...protectedRoute, admin.setMaintenance);

  // Middleware de upload para notificações (sempre uma função válida)
  const uploadImg =
    uploadNotification && typeof uploadNotification.single === 'function'
      ? uploadNotification.single('image')
      : (_req: any, _res: any, next: any) => next();

  if (typeof notification?.adminList === 'function') {
    router.get('/admin/notifications', ...protectedRoute, notification.adminList);
  }
  if (typeof notification?.adminCreate === 'function') {
    router.post('/admin/notifications', ...protectedRoute, uploadImg, notification.adminCreate);
  }
  if (typeof notification?.adminUpdate === 'function') {
    router.put('/admin/notifications/:id', ...protectedRoute, uploadImg, notification.adminUpdate);
  }
  if (typeof notification?.adminDelete === 'function') {
    router.delete('/admin/notifications/:id', ...protectedRoute, notification.adminDelete);
  }
  if (typeof notification?.adminMetrics === 'function') {
    router.get('/admin/notifications/:id/metrics', ...protectedRoute, notification.adminMetrics);
  }

  router.get('/admin/boletos', ...protectedRoute, admin.listAllBoletos);
  router.post('/admin/boleto/:id/approve', ...protectedRoute, upload.single('file'), admin.approveBoleto);
  router.post('/admin/boleto/:id/reject', ...protectedRoute, admin.rejectBoleto);

  // Lote de boletos (batch)
  router.get('/admin/boleto-batches', ...protectedRoute, h(admin.listBatches, 'listBatches'));
  router.post('/admin/boleto-batch/:id/approve', ...protectedRoute, h(admin.approveBatch, 'approveBatch'));
  router.post('/admin/boleto-batch/:id/reject', ...protectedRoute, h(admin.rejectBatch, 'rejectBatch'));

  router.get('/admin/users', ...protectedRoute, admin.listUsers);
  router.post('/admin/users/:id/action', ...protectedRoute, admin.updateUserStatus);
  router.post('/admin/users/:id/affiliate', ...protectedRoute, admin.makeAffiliateForUser);
  router.post('/admin/users/:id/remove-affiliate', ...protectedRoute, admin.removeAffiliate);
  router.post('/admin/users/:id/verify', ...protectedRoute, admin.verifyUser);

  router.get('/admin/affiliates', ...protectedRoute, admin.listAffiliates);

  // Pagar comissão de indicação (ReferralEarning)
  const uploadAffiliateReceiptMiddleware = uploadAffiliateReceipts?.single
    ? uploadAffiliateReceipts.single('receipt')
    : (_req: any, _res: any, next: any) => next();

  router.post('/admin/affiliates/:affiliateId/pay-commission', ...protectedRoute, uploadAffiliateReceiptMiddleware, async (req: any, res: any) => {
    try {
      const adminUser = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!adminUser || adminUser.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

      const { affiliateId } = req.params;
      const { txid, notes, amount } = req.body;

      const affiliate = await prisma.affiliate.findUnique({
        where: { id: affiliateId },
        include: { user: { select: { id: true, name: true, email: true, telegram: true } } },
      });
      if (!affiliate) return res.status(404).json({ error: 'Afiliado não encontrado' });

      const paymentAmount = amount ? parseFloat(amount) : affiliate.balance;
      if (paymentAmount <= 0) return res.status(400).json({ error: 'Saldo zerado' });

      let receiptUrl: string | undefined;
      if (req.file) {
        const appUrl = (process.env.APP_URL || process.env.BACKEND_URL || 'https://api.pagdepix.com').replace(/\/$/, '');
        receiptUrl = `${appUrl}/uploads/affiliate-receipts/${req.file.filename}`;
      }

      await prisma.$transaction([
        prisma.affiliatePayment.create({
          data: {
            affiliateId,
            amount: paymentAmount,
            txid: txid || null,
            receiptUrl: receiptUrl || null,
            notes: notes || null,
            adminId: req.userId,
          },
        }),
        prisma.affiliate.update({
          where: { id: affiliateId },
          data: {
            balance: { decrement: paymentAmount },
            totalPaid: { increment: paymentAmount },
          },
        }),
      ]);

      // Notificar afiliado
      try {
        await pushService.notifyWithdrawalProcessed(affiliate.userId, paymentAmount);
      } catch (_e) {}
      try {
        const { notifyUserByTelegram } = require('../services/telegram.service');
        await notifyUserByTelegram(
          affiliate.userId,
          `✅ Pagamento de comissão processado!\n\nValor: R$ ${paymentAmount.toFixed(2)}${txid ? `\nTXID: ${txid}` : ''}`
        );
      } catch (_e) {}
      try {
        const { sendGenericEmail } = require('../services/email.service');
        await sendGenericEmail(
          affiliate.user.email,
          'Comissão paga — PagDepix',
          `Olá ${affiliate.user.name},\n\nSeu pagamento de comissão de R$ ${paymentAmount.toFixed(2)} foi processado.${txid ? `\n\nTXID: ${txid}` : ''}\n\nObrigado por indicar o PagDepix!`
        );
      } catch (_e) {}

      return res.json({ success: true, amount: paymentAmount });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Histórico de pagamentos de um afiliado (admin view)
  router.get('/admin/affiliates/:affiliateId/payments', ...protectedRoute, async (req: any, res: any) => {
    try {
      const adminUser = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!adminUser || adminUser.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
      const payments = await prisma.affiliatePayment.findMany({
        where: { affiliateId: req.params.affiliateId },
        orderBy: { paidAt: 'desc' },
      });
      return res.json(payments);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Affiliate API Integration (Phase 1)
  router.get('/admin/affiliates/:id/api-integration', ...protectedRoute, h(admin.getAffiliateApiIntegration, 'getAffiliateApiIntegration'));
  router.post('/admin/affiliates/:id/api-integration/status', ...protectedRoute, h(admin.updateAffiliateApiStatus, 'updateAffiliateApiStatus'));
  router.post('/admin/affiliates/:id/api-integration/limits', ...protectedRoute, h(admin.updateAffiliateApiLimits, 'updateAffiliateApiLimits'));
  router.get('/admin/affiliates/:id/earnings', ...protectedRoute, h(admin.getAffiliateEarnings, 'getAffiliateEarnings'));
  router.get('/admin/affiliates/:id/audit-log', ...protectedRoute, h(admin.getAffiliateAuditLog, 'getAffiliateAuditLog'));

  // Affiliate API End Users (Phase 2)
  router.get('/admin/affiliates/:id/api-users', ...protectedRoute, h(admin.getAffiliateApiUsers, 'getAffiliateApiUsers'));
  router.post('/admin/affiliates/:id/api-users/:userRef/limit', ...protectedRoute, h(admin.updateEndUserLimit, 'updateEndUserLimit'));
  router.post('/admin/affiliates/:id/api-users/:userRef/block', ...protectedRoute, h(admin.blockEndUser, 'blockEndUser'));
  router.post('/admin/affiliates/:id/api-users/:userRef/unblock', ...protectedRoute, h(admin.unblockEndUser, 'unblockEndUser'));
  router.get('/admin/dashboard', ...protectedRoute, admin.getAdminDashboard);
  router.get('/admin/transactions', ...protectedRoute, admin.listAdminTransactions);
  router.get('/admin/accounting', ...protectedRoute, admin.getAdminAccounting);
  router.get('/admin/metrics', ...protectedRoute, admin.getAdminMetrics);
  router.get('/admin/logs', ...protectedRoute, admin.listLogs);

  const adminSendPix = require('../controllers/adminSendPixController');
  router.get('/admin/send-pix-orders', ...protectedRoute, adminSendPix.listAdminSendPixOrders);
  router.get('/admin/send-pix-orders/:id/receipt', ...protectedRoute, adminSendPix.getAdminSendPixReceipt);
  router.get('/admin/send-pix-orders/:id', ...protectedRoute, adminSendPix.getAdminSendPixOrder);
  router.post('/admin/send-pix-orders/:id/sync', ...protectedRoute, adminSendPix.syncSendPixOrderStatus);

  router.get('/admin/wallet-config', ...protectedRoute, admin.getWalletConfig);
  router.put('/admin/wallet-config', ...protectedRoute, admin.updateWalletConfig);


  router.get('/affiliate/data', ...protectedRoute, affiliate.getAffiliateData);

  // Histórico de pagamentos recebidos (afiliado)
  router.get('/affiliate/payments', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      const payments = await prisma.affiliatePayment.findMany({
        where: { affiliateId: aff.id },
        orderBy: { paidAt: 'desc' },
      });
      return res.json(payments);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Comissões de indicação (ReferralEarning) do afiliado
  router.get('/affiliate/referral-earnings', ...protectedRoute, async (req: any, res: any) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
      const skip = (page - 1) * limit;
      const [items, total] = await Promise.all([
        prisma.referralEarning.findMany({
          where: { earnerId: req.userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            sourceUser: { select: { name: true, email: true } },
          },
        }),
        prisma.referralEarning.count({ where: { earnerId: req.userId } }),
      ]);
      return res.json({ items, total, page, limit });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ========================================
  // API Keys (Afiliado)
  // ========================================
  router.get('/affiliate/api-keys', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      const keys = await listApiKeys(aff.id);
      return res.json(keys);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/affiliate/api-keys', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      const { label, isSandbox } = req.body;
      if (!label || typeof label !== 'string' || label.trim().length < 2) {
        return res.status(400).json({ error: 'Label é obrigatório (mín. 2 caracteres)' });
      }
      const existingKeys = await prisma.apiKey.count({ where: { affiliateId: aff.id } });
      if (existingKeys >= 10) {
        return res.status(400).json({ error: 'Limite de 10 API keys atingido' });
      }
      const result = await createApiKey(aff.id, label.trim(), !!isSandbox);
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.delete('/affiliate/api-keys/:keyId', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      await revokeApiKey(req.params.keyId, aff.id);
      return res.json({ message: 'API key revogada' });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  router.put('/affiliate/api-keys/:keyId/ip-whitelist', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      const { ipWhitelist } = req.body;
      if (!Array.isArray(ipWhitelist)) return res.status(400).json({ error: 'ipWhitelist deve ser um array' });
      await updateApiKeyIpWhitelist(req.params.keyId, aff.id, ipWhitelist);
      return res.json({ message: 'IP whitelist atualizada' });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // ========================================
  // Webhook Endpoints (Afiliado)
  // ========================================
  router.get('/affiliate/webhooks', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      const endpoints = await prisma.webhookEndpoint.findMany({
        where: { affiliateId: aff.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          apiKeyId: true,
          url: true,
          events: true,
          isActive: true,
          createdAt: true,
          _count: { select: { deliveries: true } },
        },
      });
      return res.json(endpoints);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/affiliate/webhooks', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      const { apiKeyId, url, events } = req.body;
      if (!apiKeyId || !url || !events || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: 'apiKeyId, url e events são obrigatórios' });
      }
      const apiKey = await prisma.apiKey.findFirst({ where: { id: apiKeyId, affiliateId: aff.id } });
      if (!apiKey) return res.status(404).json({ error: 'API key não encontrada' });
      try { new URL(url); } catch { return res.status(400).json({ error: 'URL inválida' }); }

      const validEvents = ['payment.received', 'payment.approved', 'payment.refused', 'recharge.completed', 'recharge.refused', 'pix.received', 'pix.approved', 'pix.refused'];
      const filtered = events.filter((e: string) => validEvents.includes(e));
      if (filtered.length === 0) return res.status(400).json({ error: `Eventos válidos: ${validEvents.join(', ')}` });

      const { randomBytes } = require('crypto');
      const secret = 'whsec_' + randomBytes(24).toString('hex');
      const endpoint = await prisma.webhookEndpoint.create({
        data: { affiliateId: aff.id, apiKeyId, url, secret, events: filtered },
        select: { id: true, apiKeyId: true, url: true, events: true, isActive: true, createdAt: true, secret: true },
      });
      return res.status(201).json({ ...endpoint, message: 'Webhook criado. Guarde o secret — ele não será exibido novamente.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.put('/affiliate/webhooks/:endpointId', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      const endpoint = await prisma.webhookEndpoint.findFirst({
        where: { id: req.params.endpointId, affiliateId: aff.id },
      });
      if (!endpoint) return res.status(404).json({ error: 'Endpoint não encontrado' });
      const { url, events, isActive } = req.body;
      const updateData: { url?: string; events?: string[]; isActive?: boolean } = {};
      if (url !== undefined) {
        try { new URL(url); } catch { return res.status(400).json({ error: 'URL inválida' }); }
        updateData.url = url;
      }
      if (events !== undefined) {
        const validEvents = ['payment.received', 'payment.approved', 'payment.refused', 'recharge.completed', 'recharge.refused', 'pix.received', 'pix.approved', 'pix.refused'];
        const filtered = Array.isArray(events) ? events.filter((e: string) => validEvents.includes(e)) : [];
        if (filtered.length === 0) return res.status(400).json({ error: 'Informe ao menos um evento válido' });
        updateData.events = filtered;
      }
      if (typeof isActive === 'boolean') updateData.isActive = isActive;
      const updated = await prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: updateData,
      });
      return res.json({ ...updated, secret: undefined });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  router.post('/affiliate/webhooks/:endpointId/regenerate-secret', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      const endpoint = await prisma.webhookEndpoint.findFirst({
        where: { id: req.params.endpointId, affiliateId: aff.id },
      });
      if (!endpoint) return res.status(404).json({ error: 'Endpoint não encontrado' });
      const { randomBytes } = require('crypto');
      const secret = 'whsec_' + randomBytes(24).toString('hex');
      await prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { secret },
      });
      return res.json({ secret, message: 'Secret regenerado. Atualize sua integração.' });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  router.delete('/affiliate/webhooks/:endpointId', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      const endpoint = await prisma.webhookEndpoint.findFirst({
        where: { id: req.params.endpointId, affiliateId: aff.id },
      });
      if (!endpoint) return res.status(404).json({ error: 'Endpoint não encontrado' });
      await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { isActive: false } });
      return res.json({ message: 'Webhook endpoint desativado' });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // Listar entregas de webhook (para debugging)
  router.get('/affiliate/webhooks/:endpointId/deliveries', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      const endpoint = await prisma.webhookEndpoint.findFirst({
        where: { id: req.params.endpointId, affiliateId: aff.id },
      });
      if (!endpoint) return res.status(404).json({ error: 'Endpoint não encontrado' });
      const deliveries = await prisma.webhookDelivery.findMany({
        where: { endpointId: endpoint.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true, event: true, responseStatus: true, attempts: true,
          deliveredAt: true, failedAt: true, createdAt: true,
        },
      });
      return res.json(deliveries);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // API Transactions: listar transações criadas via API
  router.get('/affiliate/api-transactions', ...protectedRoute, async (req: any, res: any) => {
    try {
      const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId } });
      if (!aff) return res.status(404).json({ error: 'Afiliado não encontrado' });
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
      const skip = (page - 1) * limit;

      const apiKeys = await prisma.apiKey.findMany({
        where: { affiliateId: aff.id },
        select: { id: true },
      });
      const keyIds = apiKeys.map((k: any) => k.id);
      if (keyIds.length === 0) return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });

      const [boletos, recharges, totalB, totalR] = await Promise.all([
        prisma.boleto.findMany({
          where: { apiKeyId: { in: keyIds } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true, amount: true, fee: true, totalAmount: true, status: true,
            txid: true, paymentCurrency: true, externalRef: true, isSandbox: true,
            createdAt: true, paidAt: true, confirmedAt: true,
          },
        }),
        prisma.mobileRecharge.findMany({
          where: { apiKeyId: { in: keyIds } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true, operator: true, phoneNumber: true, amount: true, fee: true,
            totalAmount: true, status: true, txid: true, paymentCurrency: true,
            externalRef: true, isSandbox: true, createdAt: true, paidAt: true,
          },
        }),
        prisma.boleto.count({ where: { apiKeyId: { in: keyIds } } }),
        prisma.mobileRecharge.count({ where: { apiKeyId: { in: keyIds } } }),
      ]);

      const combined = [
        ...boletos.map((b: any) => ({ ...b, type: 'boleto' })),
        ...recharges.map((r: any) => ({ ...r, type: 'recharge' })),
      ].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(skip, skip + limit);

      const total = totalB + totalR;
      return res.json({ data: combined, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin: gerenciar API keys de afiliados
  router.get('/admin/api-keys', ...protectedRoute, async (req: any, res: any) => {
    try {
      const adminUser = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!adminUser || adminUser.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
      const keys = await prisma.apiKey.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          affiliate: { include: { user: { select: { name: true, email: true } } } },
          _count: { select: { boletos: true, recharges: true } },
        },
      });
      return res.json(keys);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/api-keys/:keyId/suspend', ...protectedRoute, async (req: any, res: any) => {
    try {
      const adminUser = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!adminUser || adminUser.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
      const { reason } = req.body;
      const { adminSuspendApiKey } = require('../services/apiKeyService');
      await adminSuspendApiKey(req.params.keyId, reason || 'Suspended by admin');
      return res.json({ message: 'API key suspensa' });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  router.post('/admin/api-keys/:keyId/reactivate', ...protectedRoute, async (req: any, res: any) => {
    try {
      const adminUser = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!adminUser || adminUser.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
      const { adminReactivateApiKey } = require('../services/apiKeyService');
      await adminReactivateApiKey(req.params.keyId);
      return res.json({ message: 'API key reativada' });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  router.post('/withdrawal/request', ...protectedRoute, h(withdrawal.requestWithdrawal, 'withdrawal.requestWithdrawal'));
  router.get('/withdrawal/list', ...protectedRoute, h(withdrawal.listWithdrawals, 'withdrawal.listWithdrawals'));

  router.get('/admin/withdrawals', ...protectedRoute, h(withdrawal.listAllWithdrawals, 'withdrawal.listAllWithdrawals'));
  router.post('/admin/withdrawal/:id/process', ...protectedRoute, h(withdrawal.processWithdrawal, 'withdrawal.processWithdrawal'));
  router.post('/admin/withdrawal/:id/geradepix', ...protectedRoute, h(withdrawal.createGeradepixForWithdrawal, 'withdrawal.createGeradepixForWithdrawal'));

  // Suporte / Atendimento
  router.get('/admin/support/counts', ...protectedRoute, h(support.getSupportCounts, 'support.getSupportCounts'));
  router.get('/admin/support/tickets', ...protectedRoute, h(support.listAllTickets, 'support.listAllTickets'));
  router.get('/admin/support/tickets/:id', ...protectedRoute, h(support.getTicketForAdmin, 'support.getTicketForAdmin'));
  router.patch('/admin/support/tickets/:id', ...protectedRoute, h(support.updateTicketStatus, 'support.updateTicketStatus'));
  router.post('/admin/support/tickets/:id/messages', ...protectedRoute, h(support.sendMessageAsStaff, 'support.sendMessageAsStaff'));

  // ========================================
  // WEB PUSH — Gerenciamento de assinaturas
  // ========================================

  // Retorna a chave pública VAPID para o frontend
  router.get('/push/vapid-key', (req: any, res: any) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ error: 'Push não configurado' });
    return res.json({ publicKey: key });
  });

  // Registrar assinatura de dispositivo
  router.post('/push/subscribe', ...protectedRoute, async (req: any, res: any) => {
    try {
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: 'Subscription inválida' });
      }
      const userAgent = req.headers['user-agent']?.slice(0, 500) ?? null;
      await prisma.pushSubscription.upsert({
        where: { endpoint },
        update: { userId: req.userId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
        create: { userId: req.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Remover assinatura de dispositivo
  router.delete('/push/unsubscribe', ...protectedRoute, async (req: any, res: any) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: 'endpoint é obrigatório' });
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId } });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ========================================
  // NOTIFICAÇÕES — Histórico por usuário
  // ========================================

  // Listar notificações do usuário (com paginação)
  router.get('/notifications/history', ...protectedRoute, async (req: any, res: any) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
      const skip = (page - 1) * limit;

      const [notifications, total, unreadCount] = await Promise.all([
        prisma.userNotification.findMany({
          where: { userId: req.userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: { id: true, title: true, body: true, link: true, read: true, createdAt: true },
        }),
        prisma.userNotification.count({ where: { userId: req.userId } }),
        prisma.userNotification.count({ where: { userId: req.userId, read: false } }),
      ]);

      return res.json({ notifications, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, unreadCount });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Marcar notificação como lida
  router.post('/notifications/:id/read', ...protectedRoute, async (req: any, res: any) => {
    try {
      await prisma.userNotification.updateMany({
        where: { id: req.params.id, userId: req.userId },
        data: { read: true },
      });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Marcar todas como lidas
  router.post('/notifications/read-all', ...protectedRoute, async (req: any, res: any) => {
    try {
      await prisma.userNotification.updateMany({
        where: { userId: req.userId, read: false },
        data: { read: true },
      });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Contagem de não lidas (polling leve)
  router.get('/notifications/unread-count', ...protectedRoute, async (req: any, res: any) => {
    try {
      const count = await prisma.userNotification.count({ where: { userId: req.userId, read: false } });
      return res.json({ count });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin: enviar notificação push individual para um usuário
  router.post('/admin/users/:userId/notify', ...protectedRoute, async (req: any, res: any) => {
    try {
      if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
      const { title, body, link } = req.body;
      if (!title?.trim() || !body?.trim()) {
        return res.status(400).json({ error: 'title e body são obrigatórios' });
      }
      const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true } });
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      await pushService.sendNotification(req.params.userId, { title: title.trim(), body: body.trim(), link: link?.trim() || undefined });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Enviar e-mail para usuário (admin)
  router.post('/admin/users/:userId/send-email', ...protectedRoute, async (req: any, res: any) => {
    try {
      if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
      const { subject, message } = req.body;
      if (!subject?.trim() || !message?.trim()) {
        return res.status(400).json({ error: 'subject e message são obrigatórios' });
      }
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { email: true, name: true },
      });
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      const { sendGenericEmail } = require('../services/email.service');
      await sendGenericEmail(user.email, subject.trim(), message.trim());
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ========================================
  // PUSH — Reportar status de permissão (qualquer usuário logado)
  // ========================================

  router.post('/push/permission-status', ...protectedRoute, async (req: any, res: any) => {
    try {
      const { status } = req.body;
      if (!['granted', 'denied', 'default'].includes(status)) {
        return res.status(400).json({ error: 'status inválido' });
      }
      await prisma.userPushPreference.upsert({
        where: { userId: req.userId },
        update: { status },
        create: { userId: req.userId, status },
      });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ========================================
  // ADMIN PUSH — Métricas, inscritos e envio em massa
  // ========================================

  // Métricas de adoção
  router.get('/admin/push/metrics', ...protectedRoute, async (req: any, res: any) => {
    try {
      if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

      const [totalUsers, granted, denied, totalDevices] = await Promise.all([
        prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
        prisma.userPushPreference.count({ where: { status: 'granted' } }),
        prisma.userPushPreference.count({ where: { status: 'denied' } }),
        prisma.pushSubscription.count(),
      ]);

      const undecided = totalUsers - granted - denied;
      const adoptionRate = totalUsers > 0 ? Number(((granted / totalUsers) * 100).toFixed(1)) : 0;

      return res.json({ totalUsers, granted, denied, undecided, totalDevices, adoptionRate });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Lista de usuários com status push
  router.get('/admin/push/subscribers', ...protectedRoute, async (req: any, res: any) => {
    try {
      if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const status = req.query.status as string | undefined;

      // Filtro de status
      const prefWhere = status && status !== 'all'
        ? { pushPreference: { status } }
        : status === 'undecided'
          ? { pushPreference: null }
          : {};

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where: { role: { not: 'ADMIN' }, ...prefWhere },
          select: {
            id: true,
            name: true,
            email: true,
            pushPreference: { select: { status: true, updatedAt: true } },
            _count: { select: { pushSubscriptions: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.user.count({ where: { role: { not: 'ADMIN' }, ...prefWhere } }),
      ]);

      const result = users.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        pushStatus: u.pushPreference?.status ?? 'default',
        deviceCount: u._count.pushSubscriptions,
        updatedAt: u.pushPreference?.updatedAt ?? null,
      }));

      return res.json({ users: result, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Envio em massa / segmentado / individual
  router.post('/admin/push/send', ...protectedRoute, async (req: any, res: any) => {
    try {
      if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

      const { target, segment, userIds: explicitIds, title, body: msgBody, link } = req.body;
      if (!title?.trim() || !msgBody?.trim()) {
        return res.status(400).json({ error: 'title e body são obrigatórios' });
      }
      if (!['all', 'segment', 'users'].includes(target)) {
        return res.status(400).json({ error: 'target inválido' });
      }

      let resolvedIds: string[] = [];

      if (target === 'users') {
        if (!Array.isArray(explicitIds) || explicitIds.length === 0) {
          return res.status(400).json({ error: 'userIds é obrigatório para target=users' });
        }
        resolvedIds = explicitIds as string[];
      } else {
        // Para all e segment, pegar apenas usuários com subscriptions ativas
        let userFilter: any = {};

        if (target === 'segment') {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          switch (segment) {
            case 'affiliates':
              userFilter = { role: 'AFFILIATE' };
              break;
            case 'commerce':
              userFilter = { role: 'COMMERCE' };
              break;
            case 'with_balance':
              userFilter = { balance: { gt: 0 } };
              break;
            case 'recent':
              userFilter = {
                OR: [
                  { boletos: { some: { createdAt: { gte: thirtyDaysAgo } } } },
                  { mobileRecharges: { some: { createdAt: { gte: thirtyDaysAgo } } } },
                ],
              };
              break;
            default:
              return res.status(400).json({ error: 'segment inválido' });
          }
        }

        const subs = await prisma.pushSubscription.findMany({
          where: { user: userFilter },
          select: { userId: true },
          distinct: ['userId'],
        });
        resolvedIds = subs.map((s: { userId: string }) => s.userId);
      }

      if (resolvedIds.length === 0) {
        return res.json({ ok: true, sent: 0, failed: 0, total: 0 });
      }

      const { sendBulkNotification } = require('../services/push.service');
      const result = await sendBulkNotification(resolvedIds, {
        title: title.trim(),
        body: msgBody.trim(),
        link: link?.trim() || undefined,
      });

      return res.json({ ok: true, ...result, total: resolvedIds.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Bot Telegram Admin ──────────────────────────────────────────────────────
  const bot = require('../controllers/adminBotController');
  router.get('/admin/bot/users',         ...protectedRoute, h(bot.listBotUsers,        'listBotUsers'));
  router.get('/admin/bot/users/:id',     ...protectedRoute, h(bot.getBotUser,          'getBotUser'));
  router.patch('/admin/bot/users/:id',   ...protectedRoute, h(bot.updateBotUser,       'updateBotUser'));
  router.get('/admin/bot/payments',      ...protectedRoute, h(bot.listBotPayments,     'listBotPayments'));
  router.get('/admin/bot/metrics',       ...protectedRoute, h(bot.getBotMetrics,       'getBotMetrics'));
  router.post('/admin/bot/message',      ...protectedRoute, h(bot.sendBotMessage,      'sendBotMessage'));
  router.post('/admin/bot/broadcast',    ...protectedRoute, h(bot.broadcastBotMessage, 'broadcastBotMessage'));
  router.get('/admin/bot/config',        ...protectedRoute, h(bot.getBotConfig,        'getBotConfig'));
  router.post('/admin/bot/payments/:id/release', ...protectedRoute, h(bot.releaseBotPayment, 'releaseBotPayment'));

  // ─── Email Campaigns ───────────────────────────────────────────────────────
  const ec = require('../controllers/emailCampaignController');

  router.get('/admin/email/campaigns',           ...protectedRoute, h(ec.listCampaigns,    'listCampaigns'));
  router.get('/admin/email/campaigns/:id',       ...protectedRoute, h(ec.getCampaign,      'getCampaign'));
  router.post('/admin/email/campaigns',          ...protectedRoute, h(ec.createCampaign,   'createCampaign'));
  router.put('/admin/email/campaigns/:id',       ...protectedRoute, h(ec.updateCampaign,   'updateCampaign'));
  router.delete('/admin/email/campaigns/:id',    ...protectedRoute, h(ec.deleteCampaign,   'deleteCampaign'));
  router.post('/admin/email/campaigns/audience', ...protectedRoute, h(ec.previewAudience,  'previewAudience'));
  router.post('/admin/email/campaigns/:id/test', ...protectedRoute, h(ec.sendTestEmail,    'sendTestEmail'));
  router.post('/admin/email/campaigns/:id/send', ...protectedRoute, h(ec.launchCampaign,   'launchCampaign'));
  router.get('/admin/email/campaigns/:id/metrics',...protectedRoute,h(ec.getCampaignMetrics,'getCampaignMetrics'));
  router.get('/admin/email/unsubscribed',        ...protectedRoute, h(ec.listUnsubscribed, 'listUnsubscribed'));

  // Templates
  router.get('/admin/email/templates',           ...protectedRoute, h(ec.listTemplates,    'listTemplates'));
  router.post('/admin/email/templates',          ...protectedRoute, h(ec.createTemplate,   'createTemplate'));
  router.put('/admin/email/templates/:id',       ...protectedRoute, h(ec.updateTemplate,   'updateTemplate'));
  router.delete('/admin/email/templates/:id',    ...protectedRoute, h(ec.deleteTemplate,   'deleteTemplate'));

  // ─── SideSwap Refunds ──────────────────────────────────────────────────────
  const sideswapAdmin = require('../controllers/sideswapAdminController');
  router.get('/admin/sideswap/refunds',              ...protectedRoute, h(sideswapAdmin.listPendingRefunds,  'listPendingRefunds'));
  router.post('/admin/sideswap/refund/:id/complete', ...protectedRoute, h(sideswapAdmin.completeRefund,     'completeRefund'));

}
