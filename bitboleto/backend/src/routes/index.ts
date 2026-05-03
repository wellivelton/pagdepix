import { Router, Request } from 'express';
import { notifyRechargeApproved } from '../services/push.service';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireAdmin } from '../middlewares/adminMiddleware';
import multer, { File as MulterFile } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  register,
  login,
  getProfile,
  getReferralInfo,
  requestPasswordReset,
  requestTelegramVerification,
  verifyTelegramCode,
  updateTelegram,
  checkBotConnection,
  updateProfile,
  changePassword,
  verifyEmailCode,
  resendEmailCode,
  requestEmailChange,
  confirmEmailChange,
  validateNameLegacy,
  validateResetToken,
  resetPassword,
  validateRegisterName,
  validateRegisterEmail,
  sendRegisterEmailCode,
  verifyRegisterEmailCode,
  validateRegisterPhone
} from '../controllers/userController';
import type { Response } from 'express';

function parseBrlAmount(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const s = String(val ?? '').trim();
  if (!s) return NaN;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return parseFloat(normalized) || NaN;
}

type CommerceHandler = (req: Request, res: Response) => void | Promise<void>;
const commerceController = require('../controllers/commerceController') as {
  registerCommerce?: CommerceHandler;
  activateCommerce?: CommerceHandler;
  listLinks?: CommerceHandler;
  createLink?: CommerceHandler;
  deleteLink?: CommerceHandler;
  getLinkBySlug?: CommerceHandler;
  generatePixForLink?: CommerceHandler;
  getCommerceOrderStatus?: CommerceHandler;
  getSettings?: CommerceHandler;
  updateSettings?: CommerceHandler;
  uploadLogo?: CommerceHandler;
  removeLogo?: CommerceHandler;
  uploadFavicon?: CommerceHandler;
  removeFavicon?: CommerceHandler;
  getStatistics?: CommerceHandler;
  getPaymentHistory?: CommerceHandler;
  listPages?: CommerceHandler;
  createPage?: CommerceHandler;
  updatePage?: CommerceHandler;
  deletePage?: CommerceHandler;
  getPageBySlug?: CommerceHandler;
  generatePixForPage?: CommerceHandler;
  getAllMerchantsMetrics?: CommerceHandler;
  updateMerchantFees?: CommerceHandler;
  generateInitialDeposit?: CommerceHandler;
  checkInitialDepositStatus?: CommerceHandler;
  getCommerceActivationStatus?: CommerceHandler;
  generateCollateralDeposit?: CommerceHandler;
  checkCollateralDepositStatus?: CommerceHandler;
  requestCollateralWithdrawal?: CommerceHandler;
  getCollateralHistory?: CommerceHandler;
  adminListPendingCollaterals?: CommerceHandler;
  adminProcessCollateral?: CommerceHandler;
  adminCreateTrustedMerchant?: CommerceHandler;
  checkSlugAvailability?: CommerceHandler;
  getPublicStore?: CommerceHandler;
};
const registerCommerce = commerceController.registerCommerce;
const activateCommerce = commerceController.activateCommerce;
const generateInitialDeposit = commerceController.generateInitialDeposit;
const checkInitialDepositStatus = commerceController.checkInitialDepositStatus;
const getCommerceActivationStatus = commerceController.getCommerceActivationStatus;
const generateCollateralDeposit = commerceController.generateCollateralDeposit;
const checkCollateralDepositStatus = commerceController.checkCollateralDepositStatus;
const requestCollateralWithdrawal = commerceController.requestCollateralWithdrawal;
const getCollateralHistory = commerceController.getCollateralHistory;
const adminListPendingCollaterals = commerceController.adminListPendingCollaterals;
const adminProcessCollateral = commerceController.adminProcessCollateral;
const listLinks = commerceController.listLinks;
const createLink = commerceController.createLink;
const deleteLink = commerceController.deleteLink;
const getLinkBySlug = commerceController.getLinkBySlug;
const generatePixForLink = commerceController.generatePixForLink;
const getCommerceOrderStatus = commerceController.getCommerceOrderStatus;
const getSettings = commerceController.getSettings;
const updateSettings = commerceController.updateSettings;
const checkSlugAvailability = commerceController.checkSlugAvailability;
const getPublicStore = commerceController.getPublicStore;
const uploadLogo = commerceController.uploadLogo;
const removeLogo = commerceController.removeLogo;
const uploadFavicon = commerceController.uploadFavicon;
const removeFavicon = commerceController.removeFavicon;
const getStatistics = commerceController.getStatistics;
const getPaymentHistory = commerceController.getPaymentHistory;
const listPages = commerceController.listPages;
const createPage = commerceController.createPage;
const updatePage = commerceController.updatePage;
const deletePage = commerceController.deletePage;
const getPageBySlug = commerceController.getPageBySlug;
const generatePixForPage = commerceController.generatePixForPage;
const getAllMerchantsMetrics = commerceController.getAllMerchantsMetrics;
const adminCreateTrustedMerchant = commerceController.adminCreateTrustedMerchant;
const updateMerchantFees = commerceController.updateMerchantFees;
import { telegramWebhook } from '../controllers/telegramController';
import { geradepixWebhook } from '../controllers/geradepixWebhookController';
import { createSendPixOrder, listSendPixOrders, getSendPixOrderStatus, getSendPixReceipt } from '../controllers/sendPixController';
import {
  getNotificationsForMe,
  recordView,
  recordClick,
} from '../controllers/notificationController';
import {
  loginRateLimiter,
  registerRateLimiter,
  passwordResetRateLimiter,
  boletoCreateRateLimiter,
  sendEmailCodeRateLimiter
} from '../middlewares/rateLimiter';
import { bruteForceProtection } from '../middlewares/bruteForceProtection';
import { deviceFingerprintMiddleware } from '../utils/deviceFingerprint';
import { 
  createBoleto, 
  getBoletoById, 
  listUserBoletos,
  calculateFee 
} from '../services/createBoleto';
import {
  updateBoletoTxid,
  checkBoletoStatus,
  cancelBoleto,
  updateBoleto
} from '../services/updateBoletoTxid';
import { createBoletoBatch } from '../services/createBoletoBatch';
import { updateBatchTxid } from '../services/updateBatchTxid';
import {
  createRecharge,
  listUserRecharges,
  getRechargeById,
  updateRechargePhone,
  updateRechargeTxid,
  adminListRecharges,
  adminMarkRechargePaid,
  adminApproveRechargeWithReceipt,
  adminRejectRecharge,
  MOBILE_OPERATORS,
  calculateRechargeFee,
  calculateRechargeWithCoupon
} from '../services/mobileRecharge';
import {
  calculatePixCopiaColaFeeWithCoupon,
  createPixCopiaCola,
  submitPixCopiaColaTxid,
  listUserPixCopiaCola,
  getPixCopiaColaById,
  adminListPixCopiaCola,
  adminProcessPixCopiaCola,
  adminPayViaVelora,
  adminPayViaAsaas,
  adminCancelPixCopiaCola,
  adminCancelAllPending,
} from '../services/pixCopiaCola';
import { veloraDecodePixCode } from '../services/velora.service';
import { ensureIdempotent, updateResult } from '../services/webhookIdempotency.service';
import { asaasDecodePixCode } from '../services/asaas.service';
import { getMaintenanceStatusPublic, getAdminMaintenance, setMaintenance } from '../controllers/maintenanceController';
import { dispatchWebhook } from '../services/webhookService';
// import { generateDepixQr, getDepixOrderStatus, getDepixTransactions, PAGDEPIX_FEE_PERCENT, SWAPVERSE_FEE_PERCENT, DEPIX_MARGIN_PERCENT, DEPIX_FIXED_FEE } from '../services/swapverse'; // DESATIVADO: compra de DePix removida
import registerAdminRoutes from './adminRoutes';
import registerMarketplaceRoutes from './marketplaceRoutes';
import commerceApiRoutes from './commerceApiRoutes';
import gatewayRoutes from './gatewayRoutes';
import { prisma } from '../prisma';
import {
  createCommerceApiKey,
  revokeCommerceApiKey,
  listCommerceApiKeys,
} from '../services/commerceApiKeyService';
import { validateCouponUsage } from '../utils/antifraud';
import { notifyAdmin } from '../services/telegram.service';

const telegramService = require('../services/telegram.service') as { notifyUserByTelegram?: (userId: string, text: string) => Promise<void> };
const notifyUserByTelegram = telegramService.notifyUserByTelegram ?? (async () => {});

const router = Router();


// ========================================
// UPLOAD DE ARQUIVOS (PDF BOLETO / COMPROVANTE)
// ========================================
const uploadDir = path.resolve(__dirname, '..', '..', 'uploads', 'boletos');
const uploadDirRecharges = path.resolve(__dirname, '..', '..', 'uploads', 'recharges');
const uploadDirPixCopiaCola = path.resolve(__dirname, '..', '..', 'uploads', 'pix-copia-cola');
const uploadDirCommerceLogos = path.resolve(__dirname, '..', '..', 'uploads', 'commerce-logos');
const uploadDirCommerceFavicons = path.resolve(__dirname, '..', '..', 'uploads', 'commerce-favicons');
const uploadDirNotifications = path.resolve(__dirname, '..', '..', 'uploads', 'notifications');
const uploadDirAffiliateReceipts = path.resolve(__dirname, '..', '..', 'uploads', 'affiliate-receipts');
try {
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(uploadDirRecharges, { recursive: true });
  fs.mkdirSync(uploadDirPixCopiaCola, { recursive: true });
  fs.mkdirSync(uploadDirCommerceLogos, { recursive: true });
  fs.mkdirSync(uploadDirCommerceFavicons, { recursive: true });
  fs.mkdirSync(uploadDirNotifications, { recursive: true });
  fs.mkdirSync(uploadDirAffiliateReceipts, { recursive: true });
} catch (err) {
  console.error('[Routes] Não foi possível criar pasta de uploads:', err);
}

// Nome de arquivo seguro: sem path traversal, caracteres especiais; tamanho limitado
function safeUploadFilename(originalName: string): string {
  const base = (originalName || 'file')
    .replace(/\.\./g, '')
    .replace(/[^\w\s.-]/gi, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
  const name = base.slice(0, base.length - ext.length) || 'arquivo';
  return `${name}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req: Request, _file: MulterFile, cb: (err: Error | null, dest: string) => void) => {
    cb(null, uploadDir);
  },
  filename: (_req: Request, file: MulterFile, cb: (err: Error | null, filename: string) => void) => {
    const timestamp = Date.now();
    const safeName = safeUploadFilename(file.originalname || '');
    cb(null, `${timestamp}-${safeName}`);
  },
});

const storageRecharges = multer.diskStorage({
  destination: (_req: Request, _file: MulterFile, cb: (err: Error | null, dest: string) => void) => {
    cb(null, uploadDirRecharges);
  },
  filename: (_req: Request, file: MulterFile, cb: (err: Error | null, filename: string) => void) => {
    const timestamp = Date.now();
    const safeName = safeUploadFilename(file.originalname || '');
    cb(null, `${timestamp}-${safeName}`);
  },
});

const storageCommerceLogos = multer.diskStorage({
  destination: (_req: Request, _file: MulterFile, cb: (err: Error | null, dest: string) => void) => {
    cb(null, uploadDirCommerceLogos);
  },
  filename: (_req: Request, file: MulterFile, cb: (err: Error | null, filename: string) => void) => {
    const timestamp = Date.now();
    const safeName = safeUploadFilename(file.originalname || '');
    cb(null, `${timestamp}-${safeName}`);
  },
});

const storageCommerceFavicons = multer.diskStorage({
  destination: (_req: Request, _file: MulterFile, cb: (err: Error | null, dest: string) => void) => {
    cb(null, uploadDirCommerceFavicons);
  },
  filename: (_req: Request, file: MulterFile, cb: (err: Error | null, filename: string) => void) => {
    const timestamp = Date.now();
    const safeName = safeUploadFilename(file.originalname || '');
    cb(null, `${timestamp}-${safeName}`);
  },
});

const storageNotifications = multer.diskStorage({
  destination: (_req: Request, _file: MulterFile, cb: (err: Error | null, dest: string) => void) => {
    cb(null, uploadDirNotifications);
  },
  filename: (_req: Request, file: MulterFile, cb: (err: Error | null, filename: string) => void) => {
    const timestamp = Date.now();
    const safeName = safeUploadFilename(file.originalname || '');
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB
const uploadRecharge = multer({ storage: storageRecharges, limits: { fileSize: 10 * 1024 * 1024 } });

const storagePixCopiaCola = multer.diskStorage({
  destination: (_req: Request, _file: MulterFile, cb: (err: Error | null, dest: string) => void) => {
    cb(null, uploadDirPixCopiaCola);
  },
  filename: (_req: Request, file: MulterFile, cb: (err: Error | null, filename: string) => void) => {
    const timestamp = Date.now();
    const safeName = safeUploadFilename(file.originalname || '');
    cb(null, `${timestamp}-${safeName}`);
  },
});
const uploadPixCopiaCola = multer({ storage: storagePixCopiaCola, limits: { fileSize: 10 * 1024 * 1024 } });

const uploadCommerceLogo = multer({ storage: storageCommerceLogos, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB para logos
const uploadCommerceFavicon = multer({ storage: storageCommerceFavicons, limits: { fileSize: 1 * 1024 * 1024 } }); // 1 MB para favicons
const uploadNotification = multer({ storage: storageNotifications, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB para imagens

const storageAffiliateReceipts = multer.diskStorage({
  destination: (_req: Request, _file: MulterFile, cb: (err: Error | null, dest: string) => void) => {
    cb(null, uploadDirAffiliateReceipts);
  },
  filename: (_req: Request, file: MulterFile, cb: (err: Error | null, filename: string) => void) => {
    const timestamp = Date.now();
    const safeName = safeUploadFilename(file.originalname || '');
    cb(null, `${timestamp}-${safeName}`);
  },
});
const uploadAffiliateReceipts = multer({ storage: storageAffiliateReceipts, limits: { fileSize: 10 * 1024 * 1024 } });

// ========================================
// ROTAS PÚBLICAS (sem autenticação)
// ========================================

// Validações de cadastro (públicas - antes do register)
router.post('/auth/register/validate-name', validateRegisterName);
router.post('/auth/register/validate-email', validateRegisterEmail);
router.post('/auth/register/send-email-code', sendEmailCodeRateLimiter, sendRegisterEmailCode);
router.post('/auth/register/verify-email-code', verifyRegisterEmailCode);
router.post('/auth/register/validate-phone', validateRegisterPhone);

// Autenticação (com rate limiting e brute force protection)
router.post('/auth/register', deviceFingerprintMiddleware, registerRateLimiter, register);
router.post('/auth/login', deviceFingerprintMiddleware, loginRateLimiter, bruteForceProtection, login);
router.post('/auth/forgot-password', passwordResetRateLimiter, requestPasswordReset);
if (typeof registerCommerce === 'function') {
  router.post('/commerce/register', deviceFingerprintMiddleware, registerRateLimiter, registerCommerce);
}
// Link de pagamento por slug (público - página /pay/:slug)
if (typeof getLinkBySlug === 'function') {
  router.get('/commerce/link/:slug', getLinkBySlug);
}
// Gerar QR Pix para pagamento do link (público)
if (typeof generatePixForLink === 'function') {
  router.post('/commerce/link/:slug/generate-pix', generatePixForLink);
}
// Status do pedido Pix do link (público - polling)
if (typeof getCommerceOrderStatus === 'function') {
  router.get('/commerce/order/:orderId/status', getCommerceOrderStatus);
}
// Página pré-pronta por slug (público - página /page/:slug)
if (typeof getPageBySlug === 'function') {
  router.get('/commerce/page/:slug', getPageBySlug);
}
// Gerar QR Pix para pagamento da página com valor escolhido (público)
if (typeof generatePixForPage === 'function') {
  router.post('/commerce/page/:slug/generate-pix', generatePixForPage);
}

// Recuperação de senha (públicas)
router.get('/auth/validate-reset-token', validateResetToken);
router.post('/auth/reset-password', passwordResetRateLimiter, resetPassword);

// Webhook do Telegram (público; chamado pelo Telegram)
router.post('/webhook/telegram', telegramWebhook);

// Webhook GeraDePix (público; chamado pela API GeraDePix - saques Depix→Pix)
router.post('/webhook/geradepix', geradepixWebhook);

// Status do modo manutenção (público - para frontend exibir tela de manutenção)
router.get('/maintenance/status', getMaintenanceStatusPublic);

// Sitemap dinâmico do marketplace (XML)
router.get('/marketplace/sitemap.xml', async (_req, res) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://localhost:5173';

    const products = await prisma.product.findMany({
      where: { status: 'APPROVED' },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });

    const sellers = await prisma.user.findMany({
      where: { sellerProducts: { some: { status: 'APPROVED' } } },
      select: { id: true, updatedAt: true },
      take: 2000,
    });

    const staticUrls = [
      { loc: `${baseUrl}/loja`, priority: '1.0', changefreq: 'daily' },
      { loc: `${baseUrl}/loja/carrinho`, priority: '0.5', changefreq: 'monthly' },
    ];

    const productUrls = products.map((p) => ({
      loc: `${baseUrl}/loja/produto/${p.slug}`,
      lastmod: p.updatedAt.toISOString().split('T')[0],
      priority: '0.8',
      changefreq: 'weekly',
    }));

    const sellerUrls = sellers.map((s) => ({
      loc: `${baseUrl}/loja/vendedor/${s.id}`,
      lastmod: s.updatedAt.toISOString().split('T')[0],
      priority: '0.6',
      changefreq: 'weekly',
    }));

    const allUrls = [...staticUrls, ...productUrls, ...sellerUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    ${(u as any).lastmod ? `<lastmod>${(u as any).lastmod}</lastmod>` : ''}
    <changefreq>${(u as any).changefreq || 'monthly'}</changefreq>
    <priority>${(u as any).priority || '0.5'}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('[Sitemap] Erro ao gerar sitemap:', error);
    res.status(500).send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>');
  }
});

import { maintenanceMiddleware } from '../middlewares/maintenanceMiddleware';

const { getKycStatus } = require('../utils/kyc');

/**
 * Middleware KYC Nível 1: Nome + E-mail verificados.
 * Libera: Pagar boleto, Recarga.
 */
const requireKyc1 = async (req: any, res: any, next: any) => {
  const verificationEnabled = process.env.ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION === 'true';
  if (!verificationEnabled) return next();

  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Não autorizado' });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, nameVerified: true, emailVerified: true, telegramVerified: true, whatsapp: true },
  });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.role === 'ADMIN') return next();

  const kyc = getKycStatus(
    (user as any).nameVerified ?? false,
    (user as any).emailVerified ?? false,
    (user as any).telegramVerified ?? false,
    (user as any).whatsapp ?? null
  );
  if (!kyc.canUseBoleto) {
    return res.status(403).json({
      error: 'Você precisa verificar seu e-mail para usar esta funcionalidade.',
      errorCode: 'KYC_REQUIRED',
      kycLevel: kyc.level,
    });
  }
  next();
};

/**
 * Middleware KYC Nível 2: Nome + E-mail + Telegram verificados.
 * Libera: Compra Depix e demais funcionalidades sensíveis.
 */
const requireKyc2 = async (req: any, res: any, next: any) => {
  const verificationEnabled = process.env.ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION === 'true';
  if (!verificationEnabled) return next();

  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Não autorizado' });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, nameVerified: true, emailVerified: true, telegramVerified: true, whatsapp: true },
  });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.role === 'ADMIN') return next();

  const kyc = getKycStatus(
    (user as any).nameVerified ?? false,
    (user as any).emailVerified ?? false,
    (user as any).telegramVerified ?? false,
    (user as any).whatsapp ?? null
  );
  if (!kyc.canUseDepix) {
    return res.status(403).json({
      error: 'Você precisa verificar seu Telegram (KYC completo) para acessar esta funcionalidade.',
      errorCode: 'KYC_LEVEL_2_REQUIRED',
      kycLevel: kyc.level,
    });
  }
  next();
};

const protectedRoute = [authMiddleware, maintenanceMiddleware];
const protectedAdminRoute = [authMiddleware, maintenanceMiddleware, requireAdmin];
const protectedAndVerifiedRoute = [authMiddleware, maintenanceMiddleware, requireKyc1];
const protectedKyc2Route = [authMiddleware, maintenanceMiddleware, requireKyc2];

// ========================================
// ROTAS PROTEGIDAS (requerem autenticação + respeitam modo manutenção)
// ========================================

// Ativação do Modo Comércio (usuário logado solicita acesso)
if (typeof activateCommerce === 'function') {
  router.post('/commerce/activate', ...protectedRoute, activateCommerce);
}
// Fluxo de depósito inicial (ativação antifraude)
if (typeof generateInitialDeposit === 'function') {
  router.post('/commerce/initial-deposit/generate', ...protectedRoute, generateInitialDeposit);
}
if (typeof checkInitialDepositStatus === 'function') {
  router.get('/commerce/initial-deposit/status', ...protectedRoute, checkInitialDepositStatus);
}
if (typeof getCommerceActivationStatus === 'function') {
  router.get('/commerce/activation-status', ...protectedRoute, getCommerceActivationStatus);
}
// Colateral (garantia antifraude)
if (typeof generateCollateralDeposit === 'function') {
  router.post('/commerce/collateral/deposit', ...protectedRoute, generateCollateralDeposit);
}
if (typeof checkCollateralDepositStatus === 'function') {
  router.get('/commerce/collateral/deposit/:depositId/status', ...protectedRoute, checkCollateralDepositStatus);
}
if (typeof requestCollateralWithdrawal === 'function') {
  router.post('/commerce/collateral/withdraw', ...protectedRoute, requestCollateralWithdrawal);
}
if (typeof getCollateralHistory === 'function') {
  router.get('/commerce/collateral/history', ...protectedRoute, getCollateralHistory);
}

// Enviar Pix (Depix→Pix) - qualquer usuário verificado
router.get('/depix/send-pix', ...protectedAndVerifiedRoute, listSendPixOrders);
router.get('/depix/send-pix/:id/receipt', ...protectedAndVerifiedRoute, getSendPixReceipt);
router.get('/depix/send-pix/:id', ...protectedAndVerifiedRoute, getSendPixOrderStatus);
router.post('/depix/send-pix', ...protectedAndVerifiedRoute, createSendPixOrder);

// Notificações internas (pop-ups/banners)
router.get('/notifications/me', ...protectedRoute, getNotificationsForMe);
router.post('/notifications/:id/view', ...protectedRoute, recordView);
router.post('/notifications/:id/click', ...protectedRoute, recordClick);

// Perfil (permite acesso sem verificação para usuário ver seu status)
router.get('/user/profile', ...protectedRoute, getProfile);
router.get('/user/referral', ...protectedRoute, getReferralInfo);
router.put('/user/profile', ...protectedAndVerifiedRoute, updateProfile);
router.put('/user/change-password', ...protectedAndVerifiedRoute, changePassword);
// router.put('/user/depix-wallet', ...protectedKyc2Route, saveDepixWallet); // DESATIVADO: compra de DePix removida

// Verificação de email por código (usuário logado)
router.post('/auth/verify-email-code', ...protectedRoute, verifyEmailCode);
router.post('/auth/resend-email-code', ...protectedRoute, resendEmailCode);
// Troca de email (usuários antigos - uma vez)
router.post('/user/request-email-change', ...protectedRoute, requestEmailChange);
router.post('/user/confirm-email-change', ...protectedRoute, confirmEmailChange);
// Validação de nome (usuários antigos - sem reentrada)
router.post('/user/validate-name-legacy', ...protectedRoute, validateNameLegacy);

// Verificação via Telegram (NOVA LÓGICA: bot envia código para o usuário)
router.get('/auth/check-bot-connection', ...protectedRoute, checkBotConnection);
router.post('/auth/request-telegram-verification', ...protectedRoute, requestTelegramVerification);
router.post('/auth/verify-telegram-code', ...protectedRoute, verifyTelegramCode);
router.put('/auth/update-telegram', ...protectedRoute, updateTelegram);

// Upload de PDF de boleto ou comprovante (requer verificação)
router.post('/upload/boleto', ...protectedAndVerifiedRoute, upload.single('file'), (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo não enviado' });
  }

  const baseUrl = process.env.APP_URL || 'http://localhost:3001';
  const fileUrl = `${baseUrl}/uploads/boletos/${req.file.filename}`;

  return res.status(201).json({ url: fileUrl });
});

// Cotações em tempo real (pública)
router.get('/rates', async (_req, res) => {
  try {
    const { getRates: fetchRates } = await import('../services/exchangeRate');
    const rates = await fetchRates();
    return res.json({
      usdBrl: rates.usdBrl,
      btcBrl: rates.btcBrl,
      btcUsd: rates.btcUsd,
      updatedAt: rates.fetchedAt,
    });
  } catch (error: any) {
    return res.status(503).json({ error: error.message || 'Cotações indisponíveis' });
  }
});

// Calcular taxa (preview) - Rota pública para simulador
router.post('/boleto/simulate', async (req, res) => {
  try {
    const { amount, paymentCurrency } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    const result: any = await calculateFee(amount, undefined, undefined, paymentCurrency);
    
    if (!result || !result.isValid) {
      return res.status(400).json({ 
        error: result?.error || 'Erro ao calcular taxa' 
      });
    }

    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Erro ao calcular taxa:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Decodificar boleto via Asaas (linha digitável ou código de barras)
router.post('/boleto/decode', ...protectedAndVerifiedRoute, async (req: any, res) => {
  const { barcode } = req.body;
  if (!barcode || typeof barcode !== 'string') {
    return res.status(400).json({ error: 'Informe o código de barras.' });
  }
  const digits = barcode.replace(/\D/g, '');
  if (digits.length < 44) {
    return res.status(400).json({ error: 'Código inválido (mínimo 44 dígitos).' });
  }
  const { asaasIsConfigured: isConfigured, asaasSimulateBill } = require('../services/asaas.service');
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Decodificação indisponível.' });
  }
  const result = await asaasSimulateBill(barcode);
  if (!result.success) {
    return res.status(422).json({ error: result.error || 'Não foi possível identificar o boleto. Verifique o código digitado.' });
  }
  return res.status(200).json(result.bill);
});

// Calcular taxa (preview) - Rota protegida para usuários autenticados (requer verificação)
router.post('/boleto/calculate', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const { amount, couponCode, paymentCurrency } = req.body;
    const numAmount = parseBrlAmount(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    const result: any = await calculateFee(numAmount, couponCode, req.userId, paymentCurrency);
    
    if (!result || !result.isValid) {
      return res.status(400).json({ 
        error: result?.error || 'Erro ao calcular taxa' 
      });
    }

    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Erro ao calcular taxa:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Criar boleto (com rate limiting e device fingerprint) - REQUER VERIFICAÇÃO
router.post('/boleto/create', ...protectedAndVerifiedRoute, deviceFingerprintMiddleware, boletoCreateRateLimiter, async (req: any, res) => {
  try {
    const { barcode, pdfUrl, amount, dueDate, couponCode, pdfPassword, paymentCurrency } = req.body;
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });

    const numAmount = parseBrlAmount(amount);
    if (!Number.isFinite(numAmount) || numAmount < 20) {
      return res.status(400).json({ error: 'Valor inválido. Mínimo R$ 20,00.' });
    }
    const result = await createBoleto({
      userId,
      barcode,
      pdfUrl,
      pdfPassword,
      amount: numAmount,
      dueDate: new Date(dueDate),
      couponCode,
      paymentCurrency: paymentCurrency || 'DEPIX',
    }, req);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const b = result.boleto;
    // Notificação apenas quando usuário submeter TXID (Já paguei) - evita spam de testes

    return res.status(201).json({
      message: 'Boleto criado com sucesso',
      boleto: result.boleto
    });

  } catch (error) {
    console.error('Erro ao criar boleto:', error);
    return res.status(500).json({ error: 'Erro interno ao criar boleto' });
  }
});

// Listar boletos do usuário
router.get('/boleto/list', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });
    const { status, page, limit } = req.query;

    const result = await listUserBoletos(userId, {
      status: status as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20
    });

    if (!result) {
      return res.status(500).json({ error: 'Erro ao listar boletos' });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Erro ao listar boletos:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Buscar boleto específico
router.get('/boleto/:id', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });

    const boleto = await getBoletoById(id, userId);

    if (!boleto) {
      return res.status(404).json({ error: 'Boleto não encontrado' });
    }

    return res.status(200).json(boleto);

  } catch (error) {
    console.error('Erro ao buscar boleto:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Registrar TXID (Já paguei)
router.post('/boleto/:id/txid', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { txid } = req.body;
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });

    const result = await updateBoletoTxid({
      boletoId: id,
      userId,
      txid,
      ip: req.ip || 'unknown',
      userAgent: req.get('user-agent') || 'unknown'
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({
      message: 'TXID registrado com sucesso',
      boleto: result.boleto
    });

  } catch (error) {
    console.error('Erro ao registrar TXID:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Verificar status do boleto
router.get('/boleto/:id/status', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });

    const result = await checkBoletoStatus(id, userId);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    return res.status(200).json(result.status);

  } catch (error) {
    console.error('Erro ao verificar status:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Cancelar boleto
router.post('/boleto/:id/cancel', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });

    const result = await cancelBoleto(id, userId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({ message: result.message });

  } catch (error) {
    console.error('Erro ao cancelar boleto:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Atualizar boleto (editar código de barras, data de vencimento, TXID)
router.put('/boleto/:id', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { barcode, dueDate, txid } = req.body;
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });

    const result = await updateBoleto({
      boletoId: id,
      userId,
      barcode,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      txid,
      ip: req.ip || 'unknown',
      userAgent: req.get('user-agent') || 'unknown'
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({
      message: 'Boleto atualizado com sucesso',
      boleto: result.boleto
    });

  } catch (error) {
    console.error('Erro ao atualizar boleto:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// ========================================
// BOLETO BATCH (pagamento unificado)
// ========================================

// Criar lote de boletos
router.post('/boleto/batch/create', ...protectedAndVerifiedRoute, deviceFingerprintMiddleware, boletoCreateRateLimiter, async (req: any, res) => {
  try {
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });
    const { items, couponCode, paymentCurrency } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'Informe ao menos um boleto.' });

    // Converter dueDate string para Date em cada item
    const parsedItems = items.map((it: any) => ({
      ...it,
      dueDate: new Date(it.dueDate),
    }));

    const result = await createBoletoBatch({ userId, items: parsedItems, couponCode, paymentCurrency }, req);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.status(201).json({ batch: result.batch });
  } catch (err) {
    console.error('Erro ao criar batch de boletos:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Registrar TXID do lote
router.post('/boleto/batch/:id/txid', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });
    const { id } = req.params;
    const { txid } = req.body;
    const result = await updateBatchTxid({ batchId: id, userId, txid, ip: req.ip, userAgent: req.get('user-agent') });
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json({ message: 'TXID registrado com sucesso. Aguarde a confirmação do admin.' });
  } catch (err) {
    console.error('Erro ao registrar TXID do batch:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Buscar dados do lote (para o usuário acompanhar)
router.get('/boleto/batch/:id', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const userId = req.userId as string;
    const { id } = req.params;
    const batch = await (prisma as any).boletoBatch.findFirst({
      where: { id, userId },
      include: { boletos: { select: { id: true, barcode: true, amount: true, fee: true, totalAmount: true, dueDate: true, status: true } } },
    });
    if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
    return res.json({ batch });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// ========================================
// RECARGA DE CELULAR
// ========================================
router.get('/recharge/operators', (_req, res) => {
  const list = Array.isArray(MOBILE_OPERATORS) ? MOBILE_OPERATORS : [];
  return res.json({ operators: list });
});

router.get('/recharge/provider/:phoneNumber', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const { asaasIsConfigured: isConfigured, asaasGetProvider } = require('../services/asaas.service');
    if (!isConfigured()) {
      return res.status(503).json({ error: 'Detecção automática não disponível.' });
    }
    const phone = (req.params.phoneNumber ?? '').replace(/\D/g, '').replace(/^55/, '');
    if (phone.length !== 11) {
      return res.status(400).json({ error: 'Número inválido. Informe DDD + 9 dígitos.' });
    }
    const result = await asaasGetProvider(phone);
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }
    const values = (result.values ?? [])
      .map((v: any) => ({
        name: v.name,
        amount: v.maxValue,
        bonus: v.bonus,
        description: v.description ?? null,
      }))
      .filter((v: any) => typeof v.amount === 'number' && v.amount >= 20);
    return res.json({ name: result.name, values });
  } catch (err) {
    console.error('[provider] Erro ao detectar operadora:', err);
    return res.status(500).json({ error: 'Erro ao detectar operadora.' });
  }
});

router.post('/recharge/calculate', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const amount = parseBrlAmount(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    const userId = req.userId as string;
    const couponCode = req.body?.couponCode ? String(req.body.couponCode).trim() : undefined;
    const ip = req.ip || req.connection?.remoteAddress || '';
    const deviceFingerprint = req.headers?.['x-device-fingerprint'] as string | undefined;
    const paymentCurrency = req.body?.paymentCurrency ? String(req.body.paymentCurrency).trim() : undefined;
    const result = await calculateRechargeWithCoupon(amount, {
      couponCode,
      userId: userId || undefined,
      userIp: ip,
      deviceFingerprint,
      paymentCurrency,
    });
    if (!result.isValid) {
      return res.status(400).json({ isValid: false, error: result.error });
    }
    return res.json({
      isValid: true,
      fee: result.fee,
      totalAmount: result.totalAmount,
      depixAmount: result.depixAmount,
      cupomValido: result.cupomValido,
      descontoAplicado: result.descontoAplicado,
      paymentCurrency: result.paymentCurrency,
      exchangeRate: result.exchangeRate,
      cryptoAmount: result.cryptoAmount,
    });
  } catch (err) {
    console.error('Erro ao calcular recarga:', err);
    return res.status(500).json({ error: 'Erro ao calcular' });
  }
});

router.post('/recharge/create', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado. Faça login novamente.' });
    const { operator, phoneNumber, amount, couponCode, paymentCurrency } = req.body;
    if (!operator || phoneNumber == null || phoneNumber === '') {
      return res.status(400).json({ error: 'Operadora e número do celular são obrigatórios.' });
    }
    const numAmount = parseBrlAmount(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Informe um valor válido para a recarga.' });
    }
    const ip = req.ip || req.connection?.remoteAddress || '';
    const deviceFingerprint = req.headers?.['x-device-fingerprint'] as string | undefined;
    const result = await createRecharge({
      userId,
      operator: String(operator).trim(),
      phoneNumber: String(phoneNumber).trim(),
      amount: numAmount,
      couponCode: couponCode ? String(couponCode).trim() : undefined,
      userIp: ip,
      deviceFingerprint,
      paymentCurrency: paymentCurrency || 'DEPIX',
    });
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Não foi possível criar a recarga.' });
    }
    const rec = result.recharge;
    // Notificação apenas quando usuário submeter TXID (Já paguei) - evita spam de testes

    return res.status(201).json({ message: 'Recarga criada com sucesso', recharge: result.recharge });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro interno';
    console.error('Erro ao criar recarga:', error);
    return res.status(500).json({ error: msg });
  }
});

router.get('/recharge/list', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });
    const { status, page, limit } = req.query;
    const result = await listUserRecharges(userId, {
      status: status as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20
    });
    return res.json(result);
  } catch (error) {
    console.error('Erro ao listar recargas:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/recharge/:id', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });
    const recharge = await getRechargeById(req.params.id, userId);
    if (!recharge) return res.status(404).json({ error: 'Recarga não encontrada' });
    return res.json(recharge);
  } catch (error) {
    console.error('Erro ao buscar recarga:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/recharge/:id/phone', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });
    const { phoneNumber } = req.body;
    if (phoneNumber == null) return res.status(400).json({ error: 'Número é obrigatório.' });
    const result = await updateRechargePhone(req.params.id, userId, String(phoneNumber).trim());
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json({ message: 'Número atualizado.', recharge: result.recharge });
  } catch (error) {
    console.error('Erro ao atualizar número:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/recharge/:id/txid', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const userId = req.userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });
    const rechargeId = req.params?.id;
    if (!rechargeId || typeof rechargeId !== 'string' || rechargeId.trim() === '') {
      return res.status(400).json({ error: 'ID da recarga é obrigatório.' });
    }
    const { txid } = req.body;
    if (txid == null || String(txid).trim() === '') {
      return res.status(400).json({ error: 'TXID é obrigatório.' });
    }
    const result = await updateRechargeTxid(rechargeId.trim(), userId, String(txid).trim());
    if (!result.success) return res.status(400).json({ error: result.error ?? 'Não foi possível registrar o TXID.' });

    const rec = result.recharge;
    const userLabel = rec?.user?.email || rec?.user?.name || 'Cliente';
    const recCurr = rec?.paymentCurrency || 'DEPIX';
    const recCryptoLine = rec?.cryptoAmount && recCurr !== 'DEPIX'
      ? `\nCrypto: ${recCurr === 'USDT' ? rec.cryptoAmount + ' USDT' : Number(rec.cryptoAmount).toLocaleString('pt-BR') + ' sats'}`
      : '';
    notifyAdmin(
      `📱 Nova recarga no PagDepix (TXID registrado)\nValor: R$ ${(rec?.totalAmount ?? rec?.amount ?? 0).toFixed(2).replace('.', ',')} • ${rec?.operator ?? '-'}\nMoeda: ${recCurr}${recCryptoLine}\nUsuário: ${userLabel}\nID: ${rec?.id ?? '-'}\nTXID: ${String(txid).trim()}`
    ).catch(() => {});

    return res.json({ message: 'TXID registrado.', recharge: result.recharge });
  } catch (error) {
    console.error('Erro ao registrar TXID da recarga:', error);
    return res.status(500).json({ error: 'Erro interno ao registrar TXID. Tente novamente.' });
  }
});

// ========================================
// RECEBER PIX (SwapVerse - Comprar DePix com Pix)
// DESATIVADO: Funcionalidade de compra de DePix removida
// ========================================
const depixRemovedHandler = (_req: any, res: any) => res.status(410).json({ error: 'Funcionalidade de compra de DePix foi descontinuada.' });
router.post('/receber-pix/calculate', depixRemovedHandler);
router.post('/receber-pix/generate', depixRemovedHandler);
router.get('/receber-pix/my-orders', depixRemovedHandler);
router.get('/receber-pix/transactions', depixRemovedHandler);
router.get('/receber-pix/:id/status', depixRemovedHandler);

// Código original removido — consultar histórico git para referência
// router.post('/receber-pix/calculate', ...)
// router.post('/receber-pix/generate', ...)
// router.get('/receber-pix/my-orders', ...)
// router.get('/receber-pix/transactions', ...)
// router.get('/receber-pix/:id/status', ...)

// Admin: listar recargas e marcar como pago
router.get('/admin/recharges', ...protectedAdminRoute, async (req: any, res) => {
  try {
    if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    const { status, page, limit } = req.query;
    const statusVal = status === 'ALL' || !status ? undefined : (status as string);
    const result = await adminListRecharges({
      status: statusVal,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 50
    });
    return res.json(result);
  } catch (error) {
    console.error('Erro ao listar recargas (admin):', error);
    return res.status(500).json({ error: 'Erro ao listar recargas. Tente novamente.' });
  }
});

router.post('/admin/recharge/:id/paid', ...protectedAdminRoute, async (req: any, res) => {
  try {
    if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    const result = await adminMarkRechargePaid(req.params.id);
    if (!result.success) return res.status(400).json({ error: result.error });
    if ((result as any).asaasPending) {
      return res.json({ message: 'Recarga enviada ao Asaas. Aguardando confirmação da operadora.', recharge: result.recharge });
    }
    return res.json({ message: 'Recarga marcada como paga.', recharge: result.recharge });
  } catch (error) {
    console.error('Erro ao marcar recarga como paga:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Aprovar recarga. Com Asaas configurado, comprovante é opcional.
router.post('/admin/recharge/:id/approve', ...protectedAdminRoute, uploadRecharge.single('file'), async (req: any, res) => {
  try {
    if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    const rechargeId = req.params?.id;
    if (!rechargeId) return res.status(400).json({ error: 'ID da recarga é obrigatório.' });
    const baseUrl = process.env.APP_URL || 'http://localhost:3001';
    const receiptUrl = req.file ? `${baseUrl}/uploads/recharges/${req.file.filename}` : undefined;
    const result = await adminApproveRechargeWithReceipt(rechargeId, receiptUrl);
    if (!result.success) return res.status(400).json({ error: result.error });
    if ((result as any).asaasPending) {
      return res.json({ message: 'Recarga enviada ao Asaas. Aguardando confirmação da operadora.', recharge: result.recharge });
    }
    // Notificações já disparadas dentro de finalizeApprovedRecharge (Telegram + push + webhook)
    return res.json({ message: 'Recarga aprovada com sucesso.', recharge: result.recharge });
  } catch (error: any) {
    const msg = error?.message ?? '';
    console.error('Erro ao aprovar recarga:', error);
    if (msg.includes('receiptUrl') || msg.includes('Unknown arg') || (error?.code && String(error.code).startsWith('P'))) {
      return res.status(500).json({ error: 'Banco desatualizado: rode npx prisma migrate deploy na pasta backend e reinicie o servidor.' });
    }
    return res.status(500).json({ error: error?.message || 'Erro interno ao aprovar recarga. Tente novamente.' });
  }
});

router.post('/admin/recharge/:id/reject', ...protectedAdminRoute, async (req: any, res) => {
  try {
    if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    const rechargeId = req.params?.id;
    if (!rechargeId) return res.status(400).json({ error: 'ID da recarga é obrigatório.' });
    const result = await adminRejectRecharge(rechargeId);
    if (!result.success) return res.status(400).json({ error: result.error });
    // Webhook para API White-Label
    const rejectedRecharge = result.recharge as any;
    if (rejectedRecharge?.apiKeyId) {
      dispatchWebhook('recharge.refused', rechargeId, 'recharge', {
        operator: rejectedRecharge.operator,
        phoneNumber: rejectedRecharge.phoneNumber,
        amount: rejectedRecharge.amount,
        totalAmount: rejectedRecharge.totalAmount,
        status: 'CANCELLED',
        externalRef: rejectedRecharge.externalRef,
      }, rejectedRecharge.apiKeyId, rejectedRecharge.isSandbox).catch(() => {});
    }
    return res.json({ message: 'Recarga reprovada (cancelada).', recharge: result.recharge });
  } catch (error) {
    console.error('Erro ao reprovar recarga:', error);
    return res.status(500).json({ error: 'Erro interno ao reprovar recarga.' });
  }
});

// ========================================
// PIX COPIA E COLA
// ========================================
router.post('/pix-copia-cola/calculate', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const { valorOriginal, couponCode, paymentCurrency } = req.body;
    const amount = Number(valorOriginal);
    const result = await calculatePixCopiaColaFeeWithCoupon(amount, {
      couponCode,
      userId: req.userId,
      userIp: req.ip,
      deviceFingerprint: (req as any).deviceFingerprint,
      paymentCurrency,
    });
    if (!result.isValid) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    console.error('Erro ao calcular taxa Pix Copia e Cola:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

router.post('/pix-copia-cola/create', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const {
      codigoPix, valorOriginal, nomeDestinatario,
      contatoTelegram, contatoEmail, contatoWhatsApp,
      couponCode, paymentCurrency, autoMode,
    } = req.body;
    const result = await createPixCopiaCola({
      userId: req.userId,
      codigoPix,
      valorOriginal: Number(valorOriginal),
      nomeDestinatario,
      contatoTelegram,
      contatoEmail,
      contatoWhatsApp,
      couponCode,
      paymentCurrency,
      autoMode: autoMode !== false, // default true; send false to force manual
      userIp: req.ip,
      deviceFingerprint: (req as any).deviceFingerprint,
    });
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.status(201).json(result.pixCopiaCola);
  } catch (error) {
    console.error('Erro ao criar Pix Copia e Cola:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

router.get('/pix-copia-cola', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const status = req.query.status as string | undefined;
    const result = await listUserPixCopiaCola(req.userId, { status, page, limit });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// User: verificar saldo Velora e disponibilidade de modo automático
// MUST be before /:id to avoid Express treating "check-auto" as an id
router.get('/pix-copia-cola/check-auto', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const amount = parseFloat(req.query.amount as string);

    if (!Number.isFinite(amount) || amount <= 0) {
      console.warn('[check-auto] Valor inválido:', req.query.amount);
      return res.json({ available: false });
    }

    const xpubConfigured = !!(process.env.LIQUID_XPUB && process.env.LIQUID_MASTER_BLINDING_KEY);
    if (!xpubConfigured) {
      console.warn('[check-auto] LIQUID_XPUB ou LIQUID_MASTER_BLINDING_KEY não configurados — modo automático indisponível.');
      return res.json({ available: false });
    }

    const { veloraGetBalance } = await import('../services/velora.service');
    const balResult = await veloraGetBalance();

    if (!balResult.success || balResult.balance == null) {
      console.warn('[check-auto] Falha ao obter saldo Velora:', balResult.error);
      return res.json({ available: false });
    }

    const balance = balResult.balance;
    const available = balance >= amount;
    console.log(`[check-auto] amount=${amount} available=${available}`);
    return res.json({ available, balance });
  } catch (err) {
    console.error('[check-auto] Erro inesperado:', err);
    return res.json({ available: false });
  }
});

router.get('/pix-copia-cola/:id', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const record = await getPixCopiaColaById(req.params.id, req.userId);
    if (!record) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    return res.json(record);
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

router.put('/pix-copia-cola/:id/txid', ...protectedAndVerifiedRoute, uploadPixCopiaCola.single('comprovante'), async (req: any, res) => {
  try {
    const { txid } = req.body;
    let comprovanteUrl: string | undefined;
    if (req.file) {
      const appUrl = process.env.APP_URL || '';
      comprovanteUrl = `${appUrl}/uploads/pix-copia-cola/${req.file.filename}`;
    }
    const result = await submitPixCopiaColaTxid(req.params.id, req.userId, txid, comprovanteUrl);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result.pixCopiaCola);
  } catch (error) {
    console.error('Erro ao submeter TXID Pix Copia e Cola:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// Admin: cancelar todos pendentes (estático — deve vir antes de /:id)
router.post('/admin/pix-copia-cola/cancel-all-pending', ...protectedAdminRoute, async (req: any, res) => {
  try {
    if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado.' });
    const result = await adminCancelAllPending();
    if (!result.success) return res.status(500).json({ error: result.error });
    return res.json({ count: result.count });
  } catch (error) {
    console.error('Erro ao cancelar todos pendentes:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// Admin: listar
router.get('/admin/pix-copia-cola', ...protectedAdminRoute, async (req: any, res) => {
  try {
    if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado.' });
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const status = req.query.status as string | undefined;
    const result = await adminListPixCopiaCola({ status, page, limit });
    return res.json(result);
  } catch (error) {
    console.error('Erro ao listar Pix Copia e Cola (admin):', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// Admin: cancelar individual
router.post('/admin/pix-copia-cola/:id/cancel', ...protectedAdminRoute, async (req: any, res) => {
  try {
    if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado.' });
    const { reason } = req.body;
    const result = await adminCancelPixCopiaCola(req.params.id, reason);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result.pixCopiaCola);
  } catch (error) {
    console.error('Erro ao cancelar pedido:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// Admin: aprovar / reprovar
router.post('/admin/pix-copia-cola/:id/process', ...protectedAdminRoute, uploadPixCopiaCola.single('comprovante'), async (req: any, res) => {
  try {
    if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado.' });
    const { action, adminNotes } = req.body;
    if (action !== 'APPROVED' && action !== 'REJECTED') {
      return res.status(400).json({ error: 'Ação inválida. Use APPROVED ou REJECTED.' });
    }
    let comprovanteUrl: string | undefined;
    if (req.file) {
      const appUrl = (process.env.APP_URL || process.env.BACKEND_URL || 'https://api.pagdepix.com').replace(/\/$/, '');
      comprovanteUrl = `${appUrl}/uploads/pix-copia-cola/${req.file.filename}`;
    }
    const result = await adminProcessPixCopiaCola(req.params.id, action, adminNotes, comprovanteUrl);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result.pixCopiaCola);
  } catch (error) {
    console.error('Erro ao processar Pix Copia e Cola (admin):', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// User: decodificar código Pix via Velora (auto-preenchimento)
router.post('/pix-copia-cola/decode', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const { codigoPix } = req.body;
    if (!codigoPix?.trim()) return res.status(400).json({ error: 'Código Pix obrigatório.' });

    // Try Velora first, fall back to Asaas on failure
    let result = await veloraDecodePixCode(codigoPix.trim());
    if (!result.success) {
      console.warn(`[decode] Velora falhou (${result.error}), tentando Asaas como fallback...`);
      const asaasResult = await asaasDecodePixCode(codigoPix.trim());
      if (!asaasResult.success) {
        return res.status(400).json({ error: asaasResult.error || result.error });
      }
      result = asaasResult;
    }

    return res.json({
      receiverName: result.receiverName,
      originalAmount: result.originalAmount,
      bankName: result.bankName,
    });
  } catch (error) {
    console.error('Erro ao decodificar QR Code:', error);
    return res.status(500).json({ error: 'Erro ao decodificar código Pix.' });
  }
});

// Admin: pagar via Velora
router.post('/admin/pix-copia-cola/:id/pay-velora', ...protectedAdminRoute, async (req: any, res) => {
  try {
    if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado.' });
    const result = await adminPayViaVelora(req.params.id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result.pixCopiaCola);
  } catch (error) {
    console.error('Erro ao pagar via Velora:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// Admin: pagar via Asaas
router.post('/admin/pix-copia-cola/:id/pay-asaas', ...protectedAdminRoute, async (req: any, res) => {
  try {
    if (req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado.' });
    const result = await adminPayViaAsaas(req.params.id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result.pixCopiaCola);
  } catch (error) {
    console.error('Erro ao pagar via Asaas:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// Webhook Velora: atualização de status de pagamento de saída
router.post('/webhook/velora', async (req: any, res) => {
  const secret = process.env.VELORA_WEBHOOK_SECRET;

  // Secret is mandatory — never accept unsigned webhooks in production.
  if (!secret) {
    console.error('[VELORA-WEBHOOK] VELORA_WEBHOOK_SECRET not configured. Rejecting request.');
    return res.status(401).json({ error: 'Webhook não configurado.' });
  }

  const signature = req.headers['v-signature'] as string | undefined;
  if (!signature) {
    console.warn('[VELORA-WEBHOOK] Missing v-signature header.');
    return res.status(401).json({ error: 'Assinatura ausente.' });
  }

  try {
    // Use the raw body bytes — NOT JSON.stringify(req.body) — so the HMAC
    // matches the bytes Velora actually signed, regardless of whitespace or key order.
    const rawBody: Buffer = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      console.warn('[VELORA-WEBHOOK] Assinatura inválida.');
      return res.status(401).json({ error: 'Assinatura inválida.' });
    }
  } catch {
    return res.status(401).json({ error: 'Assinatura inválida.' });
  }

  try {
    const body = req.body as any;
    const event: string = body?.event || '';
    const externalId: string = body?.externalId || body?.data?.externalId || '';
    const newStatus: string = body?.status || body?.data?.status || event;

    if (!externalId) {
      return res.status(200).json({ ok: true });
    }

    // Idempotency check before any side effects (HMAC already verified above).
    const idResult = await ensureIdempotent({
      source: 'velora',
      eventType: newStatus || 'unknown',
      externalId,
      payload: body,
    });

    if (idResult.alreadyProcessed) {
      console.log(`[VELORA-WEBHOOK] Duplicate ${newStatus}/${externalId} — skipping`);
      return res.status(200).json({ ok: true, duplicate: true });
    }

    res.status(200).json({ ok: true });

    const record = await (prisma as any).pixCopiaCola.findFirst({
      where: { veloraExternalId: externalId },
    });
    if (!record) {
      await updateResult({ source: 'velora', eventType: newStatus || 'unknown', externalId, result: 'ok' }).catch(() => {});
      return;
    }

    await (prisma as any).pixCopiaCola.update({
      where: { id: record.id },
      data: { veloraStatus: newStatus || null },
    });

    console.log(`[VELORA-WEBHOOK] ${event} para PCC ${record.id} (Velora: ${externalId})`);
    await updateResult({ source: 'velora', eventType: newStatus || 'unknown', externalId, result: 'ok' }).catch(() => {});
  } catch (err) {
    console.error('[VELORA-WEBHOOK] Erro:', err);
  }
});

// Links de pagamento (comerciante logado)
if (typeof listLinks === 'function') {
  router.get('/commerce/links', ...protectedRoute, listLinks);
}
if (typeof createLink === 'function') {
  router.post('/commerce/links', ...protectedAndVerifiedRoute, createLink);
}
if (typeof deleteLink === 'function') {
  router.delete('/commerce/links/:id', ...protectedAndVerifiedRoute, deleteLink);
}
// Configurações do comerciante
if (typeof getSettings === 'function') {
  router.get('/commerce/settings', ...protectedAndVerifiedRoute, getSettings);
}
if (typeof updateSettings === 'function') {
  router.put('/commerce/settings', ...protectedAndVerifiedRoute, updateSettings);
}
if (typeof checkSlugAvailability === 'function') {
  router.get('/commerce/slug/check/:slug', ...protectedAndVerifiedRoute, checkSlugAvailability);
}
// Loja pública (sem autenticação)
if (typeof getPublicStore === 'function') {
  router.get('/commerce/store/:storeSlug', getPublicStore);
}

// ─── Email tracking e unsubscribe (público, sem autenticação) ─────────────────
{
  const { trackOpen, handleUnsubscribe } = require('../controllers/emailCampaignController');
  if (typeof trackOpen === 'function') {
    router.get('/email/track/open/:trackToken', trackOpen);
  }
  if (typeof handleUnsubscribe === 'function') {
    router.get('/email/unsubscribe/:token', handleUnsubscribe);
  }
}
if (typeof uploadLogo === 'function') {
  router.post('/commerce/settings/logo', ...protectedAndVerifiedRoute, uploadCommerceLogo.single('logo'), uploadLogo);
}
if (typeof removeLogo === 'function') {
  router.delete('/commerce/settings/logo', ...protectedAndVerifiedRoute, removeLogo);
}
if (typeof uploadFavicon === 'function') {
  router.post('/commerce/settings/favicon', ...protectedAndVerifiedRoute, uploadCommerceFavicon.single('favicon'), uploadFavicon);
}
if (typeof removeFavicon === 'function') {
  router.delete('/commerce/settings/favicon', ...protectedAndVerifiedRoute, removeFavicon);
}
// Estatísticas do comerciante
if (typeof getStatistics === 'function') {
  router.get('/commerce/statistics', ...protectedAndVerifiedRoute, getStatistics);
}
// Histórico de pagamentos do comerciante
if (typeof getPaymentHistory === 'function') {
  router.get('/commerce/payments/history', ...protectedAndVerifiedRoute, getPaymentHistory);
}
// Admin: Métricas de todos os comerciantes
if (typeof getAllMerchantsMetrics === 'function') {
  router.get('/admin/commerce/merchants/metrics', ...protectedAdminRoute, getAllMerchantsMetrics);
}
// Admin: Criar conta de comerciante para terceiros (trusted merchant - sem CNPJ/depósito)
if (typeof adminCreateTrustedMerchant === 'function') {
  router.post('/admin/commerce/create-trusted-merchant', ...protectedAdminRoute, adminCreateTrustedMerchant);
}
// Admin: atualizar taxas de comerciante
if (typeof updateMerchantFees === 'function') {
  router.put('/admin/commerce/merchant/:partnerId/fees', ...protectedAdminRoute, updateMerchantFees);
}
if (typeof adminListPendingCollaterals === 'function') {
  router.get('/admin/commerce/collaterals/pending', ...protectedAdminRoute, adminListPendingCollaterals);
}
if (typeof adminProcessCollateral === 'function') {
  router.post('/admin/commerce/collateral/:depositId/process', ...protectedAdminRoute, adminProcessCollateral);
}
// Páginas pré-prontas (comerciante logado)
if (typeof listPages === 'function') {
  router.get('/commerce/pages', ...protectedAndVerifiedRoute, listPages);
}
if (typeof createPage === 'function') {
  router.post('/commerce/pages', ...protectedAndVerifiedRoute, createPage);
}
if (typeof updatePage === 'function') {
  router.put('/commerce/pages/:id', ...protectedAndVerifiedRoute, updatePage);
}
if (typeof deletePage === 'function') {
  router.delete('/commerce/pages/:id', ...protectedAndVerifiedRoute, deletePage);
}

// Suporte / Chat (usuário logado) – require + checagem para evitar "handler must be a function" no runtime
try {
  const supportController = require('../controllers/supportController') as {
    listMyTickets?: (req: Request, res: Response) => void | Promise<void>;
    createTicket?: (req: Request, res: Response) => void | Promise<void>;
    getTicketMessages?: (req: Request, res: Response) => void | Promise<void>;
    sendMessage?: (req: Request, res: Response) => void | Promise<void>;
  };
  const a = supportController.listMyTickets;
  const b = supportController.createTicket;
  const c = supportController.getTicketMessages;
  const d = supportController.sendMessage;
  if (typeof a === 'function' && typeof b === 'function' && typeof c === 'function' && typeof d === 'function') {
    router.get('/support/tickets', ...protectedAndVerifiedRoute, a);
    router.post('/support/tickets', ...protectedAndVerifiedRoute, b);
    router.get('/support/tickets/:id/messages', ...protectedAndVerifiedRoute, c);
    router.post('/support/tickets/:id/messages', ...protectedAndVerifiedRoute, d);
  } else {
    console.warn('[Routes] Support controller sem métodos esperados; rotas /support/* desativadas.');
  }
} catch (err) {
  console.warn('[Routes] Support controller não carregado; rotas /support/* desativadas.', (err as Error).message);
}

// Rotas admin carregadas com require tardio para evitar dependência circular
registerAdminRoutes(router, protectedAdminRoute, upload, uploadRecharge, uploadNotification, uploadAffiliateReceipts);

// Marketplace (loja de produtos digitais)
registerMarketplaceRoutes(router, protectedRoute, protectedAndVerifiedRoute);

// API Commerce (autenticação por X-API-Key / X-API-Secret)
router.use('/commerce/api', commerceApiRoutes);

// API Gateway (cobranças Pix com liquidação D+1 para integração em sites/apps)
router.use('/gateway', gatewayRoutes);

// Helper: localiza ou cria automaticamente um CommercePartner para usuários ADMIN.
// Trata race condition: quando duas requisições paralelas tentam criar o mesmo registro,
// a segunda recebe P2002 e simplesmente relê o registro já criado pela primeira.
async function resolveOrCreatePartner(userId: string, userRole: string) {
  let partner = await prisma.commercePartner.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (!partner && userRole === 'ADMIN') {
    try {
      partner = await prisma.commercePartner.create({
        data: {
          userId,
          documentNumber: '00000000000000',
          businessType: 'admin',
          status: 'APPROVED',
          createdByAdmin: true,
        },
        select: { id: true, status: true },
      });
    } catch (e: any) {
      // P2002 = unique constraint — outra requisição concorrente já criou o registro
      if (e?.code === 'P2002') {
        partner = await prisma.commercePartner.findUnique({
          where: { userId },
          select: { id: true, status: true },
        });
      } else {
        throw e;
      }
    }
  }
  return partner;
}

// Painel API Commerce (comerciante logado – gerenciar chaves e webhooks)
router.get('/commerce/api-keys', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const partner = await resolveOrCreatePartner(req.userId, req.userRole);
    if (!partner) return res.status(404).json({ error: 'Comerciante não encontrado' });
    if (partner.status !== 'APPROVED') return res.status(403).json({ error: 'Modo Comércio precisa estar aprovado para usar a API' });
    const keys = await listCommerceApiKeys(partner.id);
    return res.json(keys);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
router.post('/commerce/api-keys', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const partner = await resolveOrCreatePartner(req.userId, req.userRole);
    if (!partner) return res.status(404).json({ error: 'Comerciante não encontrado' });
    if (partner.status !== 'APPROVED') return res.status(403).json({ error: 'Modo Comércio precisa estar aprovado para usar a API' });
    const { label, isSandbox } = req.body;
    if (!label || typeof label !== 'string' || label.trim().length < 2) {
      return res.status(400).json({ error: 'Label é obrigatório (mín. 2 caracteres)' });
    }
    const count = await prisma.commerceApiKey.count({ where: { partnerId: partner.id } });
    if (count >= 10) return res.status(400).json({ error: 'Limite de 10 API keys atingido' });
    const result = await createCommerceApiKey(partner.id, label.trim(), !!isSandbox);
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
router.delete('/commerce/api-keys/:keyId', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const partner = await resolveOrCreatePartner(req.userId, req.userRole);
    if (!partner) return res.status(404).json({ error: 'Comerciante não encontrado' });
    await revokeCommerceApiKey(req.params.keyId, partner.id);
    return res.json({ message: 'API key revogada' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.get('/commerce/webhooks', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const partner = await resolveOrCreatePartner(req.userId, req.userRole);
    if (!partner) return res.status(404).json({ error: 'Comerciante não encontrado' });
    if (partner.status !== 'APPROVED') return res.status(403).json({ error: 'Modo Comércio precisa estar aprovado' });
    const endpoints = await prisma.commerceWebhookEndpoint.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(endpoints.map((e) => ({ ...e, secret: undefined })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
router.post('/commerce/webhooks', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const partner = await resolveOrCreatePartner(req.userId, req.userRole);
    if (!partner) return res.status(404).json({ error: 'Comerciante não encontrado' });
    if (partner.status !== 'APPROVED') return res.status(403).json({ error: 'Modo Comércio precisa estar aprovado' });
    const { url, events } = req.body;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url é obrigatório' });
    try { new URL(url); } catch { return res.status(400).json({ error: 'URL inválida' }); }
    const validEvents = ['charge.created', 'charge.paid', 'charge.expired'];
    const filtered = Array.isArray(events) ? events.filter((e: string) => validEvents.includes(e)) : ['charge.paid'];
    const { randomBytes } = require('crypto');
    const secret = 'whsec_' + randomBytes(24).toString('hex');
    const endpoint = await prisma.commerceWebhookEndpoint.create({
      data: { partnerId: partner.id, url, events: filtered.length ? filtered : ['charge.paid'], secret },
    });
    return res.status(201).json({ ...endpoint, secret });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
router.delete('/commerce/webhooks/:endpointId', ...protectedAndVerifiedRoute, async (req: any, res) => {
  try {
    const partner = await resolveOrCreatePartner(req.userId, req.userRole);
    if (!partner) return res.status(404).json({ error: 'Comerciante não encontrado' });
    await prisma.commerceWebhookEndpoint.deleteMany({
      where: { id: req.params.endpointId, partnerId: partner.id },
    });
    return res.json({ message: 'Webhook removido' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NEWS FEED — NewsData.io (crypto/finance/politics) + RSS Jovem Pan (brasil)
// TTL NewsData: 1800s (30min) → ~144 req/dia ≤ cota grátis 200/dia
// TTL RSS:      900s  (15min) → grátis, sem cota
// ─────────────────────────────────────────────────────────────────────────────
import { fetchJovemPan } from '../services/rssAggregator';

interface NewsItem {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  source: string;
  url: string;
  category: 'crypto' | 'finance' | 'politics' | 'brasil';
  publishedAt: string;
}

const NEWS_CACHE_TTL_MS  = Number(process.env.NEWS_CACHE_TTL_SECONDS  || 1800) * 1000;
const NEWS_RSS_CACHE_TTL = Number(process.env.NEWS_RSS_CACHE_TTL_SECONDS || 900) * 1000;
const NEWS_STALE_MAX_MS  = 6 * 60 * 60 * 1000;

const newsCache = new Map<string, { items: NewsItem[]; fetchedAt: number }>();

function toISO(d: string | null): string {
  if (!d) return new Date().toISOString();
  return d.includes('T') ? d : d.replace(' ', 'T') + 'Z';
}

type ApiCategory = 'crypto' | 'finance' | 'politics';

const NEWSDATA_PARAMS: Record<ApiCategory, string> = {
  crypto:   'q=bitcoin%20OR%20ethereum%20OR%20criptomoeda%20OR%20stablecoin%20OR%20blockchain%20OR%20USDT&language=pt,en&country=br,us',
  finance:  'category=business&language=pt&country=br,us',
  politics: 'category=politics&language=pt&country=br',
};

async function fetchNewsDataCategory(cat: ApiCategory): Promise<NewsItem[]> {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return [];
  const url = `https://newsdata.io/api/1/news?apikey=${key}&${NEWSDATA_PARAMS[cat]}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`NewsData ${resp.status}`);
  const data: any = await resp.json();
  return (data.results || []).map((r: any) => ({
    id: `nd_${r.article_id}`,
    title: r.title || '',
    description: r.description || '',
    thumbnail: r.image_url || null,
    source: r.source_name || r.source_id || 'NewsData',
    url: r.link || '',
    category: cat,
    publishedAt: toISO(r.pubDate),
  }));
}

async function getCachedOrFetch(cat: ApiCategory, now: number): Promise<NewsItem[]> {
  const cached = newsCache.get(cat);
  if (cached && now - cached.fetchedAt < NEWS_CACHE_TTL_MS) return cached.items;
  const items = await fetchNewsDataCategory(cat);
  newsCache.set(cat, { items, fetchedAt: now });
  return items;
}

async function getCachedOrFetchBrasil(now: number): Promise<NewsItem[]> {
  const cached = newsCache.get('brasil');
  if (cached && now - cached.fetchedAt < NEWS_RSS_CACHE_TTL) return cached.items;
  const items = (await fetchJovemPan()) as NewsItem[];
  newsCache.set('brasil', { items, fetchedAt: now });
  return items;
}

async function getNews(category: string): Promise<{ items: NewsItem[]; fetchedAt: string; stale?: boolean }> {
  const now = Date.now();
  const cached = newsCache.get(category);

  const ttl = category === 'brasil' ? NEWS_RSS_CACHE_TTL : NEWS_CACHE_TTL_MS;
  if (cached && now - cached.fetchedAt < ttl) {
    return { items: cached.items, fetchedAt: new Date(cached.fetchedAt).toISOString() };
  }

  try {
    let items: NewsItem[] = [];

    if (category === 'brasil') {
      items = await getCachedOrFetchBrasil(now);
    } else if (category === 'crypto' || category === 'finance' || category === 'politics') {
      items = await getCachedOrFetch(category, now);
      newsCache.set(category, { items, fetchedAt: now });
    } else {
      // 'all' — fetch all 4 sources in parallel, reusing per-category caches
      const [crypto, finance, politics, brasil] = await Promise.allSettled([
        getCachedOrFetch('crypto', now),
        getCachedOrFetch('finance', now),
        getCachedOrFetch('politics', now),
        getCachedOrFetchBrasil(now),
      ]);
      if (crypto.status === 'fulfilled')   items.push(...crypto.value);
      if (finance.status === 'fulfilled')  items.push(...finance.value);
      if (politics.status === 'fulfilled') items.push(...politics.value);
      if (brasil.status === 'fulfilled')   items.push(...brasil.value);
    }

    // Deduplicate by URL, sort newest first
    const seen = new Set<string>();
    items = items.filter(item => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
    items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    if (category === 'all') newsCache.set('all', { items, fetchedAt: now });
    return { items, fetchedAt: new Date(now).toISOString() };
  } catch {
    if (cached && now - cached.fetchedAt < NEWS_STALE_MAX_MS) {
      return { items: cached.items, fetchedAt: new Date(cached.fetchedAt).toISOString(), stale: true };
    }
    return { items: [], fetchedAt: new Date(now).toISOString() };
  }
}

router.get('/feed', ...protectedRoute, async (req: any, res) => {
  try {
    const validCategories = ['all', 'crypto', 'finance', 'politics', 'brasil'];
    const category = validCategories.includes(String(req.query.category)) ? String(req.query.category) : 'all';
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const result = await getNews(category);
    return res.json({
      items: result.items.slice(0, limit),
      fetchedAt: result.fetchedAt,
      ...(result.stale ? { stale: true } : {}),
    });
  } catch {
    return res.json({ items: [], fetchedAt: new Date().toISOString() });
  }
});

export default router;
