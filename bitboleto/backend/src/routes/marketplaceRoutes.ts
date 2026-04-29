import { Router } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import multer from 'multer';

import * as productController from '../controllers/marketplace/productController';
import * as orderController from '../controllers/marketplace/orderController';
import * as reviewController from '../controllers/marketplace/reviewController';
import * as sellerController from '../controllers/marketplace/sellerController';
import * as disputeController from '../controllers/marketplace/disputeController';
import * as bannerController from '../controllers/marketplace/bannerController';
import * as chatController from '../controllers/marketplace/chatController';
import * as cartController from '../controllers/marketplace/cartController';
import * as cancellationController from '../controllers/marketplace/cancellationController';
import * as returnController from '../controllers/marketplace/returnController';
import * as searchController from '../controllers/marketplace/searchController';
import * as orderNotificationController from '../controllers/marketplace/notificationController';
import * as auditController from '../controllers/marketplace/auditController';
import * as wishlistController from '../controllers/marketplace/wishlistController';
import * as categoryController from '../controllers/marketplace/categoryController';
import * as affiliateMarketplaceController from '../controllers/marketplace/affiliateMarketplaceController';
import * as globalCouponController from '../controllers/marketplace/globalCouponController';
import * as adminMetricsController from '../controllers/marketplace/adminMetricsController';
import { checkSellerRole } from '../middlewares/checkSellerRole';
import {
  marketplaceCheckoutRateLimiter,
  marketplaceActionRateLimiter,
} from '../middlewares/rateLimiter';

const uploadDirProducts = path.resolve(__dirname, '..', '..', 'uploads', 'products');
const uploadDirProductFiles = path.resolve(__dirname, '..', '..', 'uploads', 'product-files');
const uploadDirChatAttachments = path.resolve(__dirname, '..', '..', 'uploads', 'chat-attachments');

try {
  fs.mkdirSync(uploadDirProducts, { recursive: true });
  fs.mkdirSync(uploadDirProductFiles, { recursive: true });
  fs.mkdirSync(uploadDirChatAttachments, { recursive: true });
} catch (err) {
  console.error('[Marketplace] Não foi possível criar pasta de uploads:', err);
}

function safeFilename(name: string): string {
  const base = (name || 'file')
    .replace(/\.\./g, '')
    .replace(/[^\w\s.-]/gi, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
  const n = base.slice(0, base.length - ext.length) || 'arquivo';
  return `${n}${ext}`;
}

const storageProductCover = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirProducts),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${safeFilename(file.originalname || '')}`),
});

const storageProductFiles = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirProductFiles),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${safeFilename(file.originalname || '')}`),
});

const uploadProductCover = multer({
  storage: storageProductCover,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpe?g|png|webp|gif)$/i.test(file.originalname || '');
    if (allowed) cb(null, true);
    else cb(new Error('Apenas imagens (jpg, png, webp, gif) são permitidas') as any, false);
  },
});

const uploadProductFilesMulter = multer({
  storage: storageProductFiles,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const storageChatAttachments = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirChatAttachments),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${safeFilename(file.originalname || '')}`),
});

const uploadChatAttachment = multer({
  storage: storageChatAttachments,
  limits: { fileSize: 20 * 1024 * 1024 },
});

export default function registerMarketplaceRoutes(
  router: Router,
  protectedRoute: any[],
  protectedAndVerified: any[]
) {
  const sellerRoute = [...protectedRoute, checkSellerRole];

  // ---- Público ----
  router.get('/marketplace/products', productController.listProducts);
  router.get('/marketplace/search', searchController.searchProducts);
  router.get('/marketplace/product/:slug', productController.getProduct);
  router.get('/marketplace/banners', bannerController.listBanners);
  router.get('/marketplace/product/:productId/reviews', reviewController.getProductReviews);
  router.get('/marketplace/categories', categoryController.listCategories);
  router.get('/marketplace/seller/:sellerId/profile', productController.getSellerPublicProfile);
  router.get('/marketplace/seller/:sellerId/profile', productController.getSellerPublicProfile);

  // ---- Download (token na query) ----
  router.get('/marketplace/download', orderController.downloadFile);

  // ---- Carrinho (logado) ----
  router.get('/marketplace/cart', ...protectedRoute, cartController.getCart);
  router.post('/marketplace/cart/items', marketplaceActionRateLimiter, ...protectedAndVerified, cartController.addToCart);
  router.put('/marketplace/cart/items/:itemId', ...protectedAndVerified, cartController.updateItem);
  router.delete('/marketplace/cart/items/:itemId', ...protectedAndVerified, cartController.removeItem);
  router.post('/marketplace/checkout/cart', marketplaceCheckoutRateLimiter, ...protectedAndVerified, cartController.checkoutCart);

  // ---- Comprador (logado) ----
  router.post('/marketplace/order', ...protectedAndVerified, orderController.createOrder);
  router.get('/marketplace/order/:orderId/status', ...protectedRoute, orderController.getOrderStatus);
  router.get('/marketplace/orders', ...protectedRoute, orderController.getMyOrders);
  router.get('/marketplace/order/:orderId', ...protectedRoute, orderController.getOrderDetail);
  router.get('/marketplace/order/:orderId/chat', ...protectedRoute, chatController.listOrderChatMessages);
  router.post('/marketplace/order/:orderId/chat', ...protectedRoute, chatController.sendOrderChatMessage);
  router.post('/marketplace/order/:orderId/chat/attachment', ...protectedRoute, uploadChatAttachment.single('file'), chatController.sendOrderChatAttachment);
  router.get('/marketplace/chat/attachment/:messageId', ...protectedRoute, chatController.downloadChatAttachment);
  router.get('/marketplace/seller-order/:sellerOrderId/chat', ...protectedRoute, chatController.listSellerOrderChatMessages);
  router.post('/marketplace/seller-order/:sellerOrderId/chat', ...protectedRoute, chatController.sendSellerOrderChatMessage);
  router.post('/marketplace/seller-order/:sellerOrderId/chat/attachment', ...protectedRoute, uploadChatAttachment.single('file'), chatController.sendSellerOrderChatAttachment);
  router.get('/marketplace/seller-order/chat/attachment/:messageId', ...protectedRoute, chatController.downloadSellerOrderChatAttachment);
  router.put('/marketplace/seller-order/chat/message/:messageId/read', ...protectedRoute, chatController.markSellerOrderChatAsRead);
  router.post('/marketplace/review', marketplaceActionRateLimiter, ...protectedRoute, reviewController.createReview);
  router.get('/marketplace/wishlist', ...protectedRoute, wishlistController.getWishlist);
  router.post('/marketplace/wishlist', marketplaceActionRateLimiter, ...protectedRoute, wishlistController.addToWishlist);
  router.delete('/marketplace/wishlist/:productId', ...protectedRoute, wishlistController.removeFromWishlist);
  router.get('/marketplace/notifications', ...protectedRoute, orderNotificationController.listMyNotifications);
  router.put('/marketplace/notifications/:id/read', ...protectedRoute, orderNotificationController.markAsRead);
  router.post('/marketplace/order/cancel', ...protectedRoute, cancellationController.requestCancellation);
  router.post('/marketplace/return', ...protectedRoute, returnController.requestReturn);

  // ---- Vendedor ----
  router.post('/marketplace/product', ...sellerRoute, uploadProductCover.single('cover'), productController.createProduct);
  router.get('/marketplace/seller/products', ...sellerRoute, productController.getSellerProducts);
  router.put('/marketplace/product/:productId', ...sellerRoute, uploadProductCover.single('cover'), productController.updateProduct);
  router.post('/marketplace/product/:productId/submit-for-approval', ...sellerRoute, productController.submitForApproval);
  router.post('/marketplace/product/:productId/files', ...sellerRoute, uploadProductFilesMulter.array('files', 10), productController.uploadProductFiles);
  router.post('/marketplace/product/:productId/codes', ...sellerRoute, productController.addProductCodes);

  router.get('/marketplace/seller/dashboard', ...sellerRoute, sellerController.getSellerDashboard);
  router.get('/marketplace/seller/orders', ...sellerRoute, sellerController.getSellerOrders);
  router.get('/marketplace/seller/balance', ...sellerRoute, sellerController.getSellerBalance);
  router.get('/marketplace/seller/transactions', ...sellerRoute, sellerController.getSellerTransactions);
  router.get('/marketplace/seller/reports', ...sellerRoute, sellerController.getSellerReports);
  router.put('/marketplace/seller/wallet', ...sellerRoute, sellerController.updateSellerWallet);
  router.post('/marketplace/seller/withdrawal', ...sellerRoute, sellerController.requestSellerWithdrawal);
  router.get('/marketplace/seller/coupons', ...sellerRoute, sellerController.getSellerCoupons);
  router.post('/marketplace/seller/coupon', ...sellerRoute, sellerController.createSellerCoupon);

  // ---- Disputa (comprador/vendedor) ----
  router.post('/marketplace/dispute', marketplaceActionRateLimiter, ...protectedRoute, disputeController.openDispute);
  router.post('/marketplace/dispute/respond', marketplaceActionRateLimiter, ...protectedRoute, disputeController.respondToDispute);

  // ---- Afiliado marketplace ----
  router.post('/marketplace/affiliate/link', ...protectedRoute, affiliateMarketplaceController.generateLink);
  router.get('/marketplace/affiliate/earnings', ...protectedRoute, affiliateMarketplaceController.getMarketplaceEarnings);

  // ---- Admin ----
  router.get('/marketplace/admin/metrics', ...protectedRoute, adminMetricsController.getAdminMetrics);
  router.get('/marketplace/admin/products', ...protectedRoute, productController.adminListProducts);
  router.get('/marketplace/admin/reviews', ...protectedRoute, reviewController.adminListReviews);
  router.get('/marketplace/admin/sellers', ...protectedRoute, sellerController.adminListSellers);
  router.get('/marketplace/admin/seller-withdrawals', ...protectedRoute, sellerController.adminListSellerWithdrawals);
  router.post('/marketplace/admin/seller-withdrawal/:withdrawalId/process', ...protectedRoute, sellerController.adminProcessSellerWithdrawal);
  router.get('/marketplace/admin/global-coupons', ...protectedRoute, globalCouponController.adminListGlobalCoupons);
  router.post('/marketplace/admin/global-coupon', ...protectedRoute, globalCouponController.adminCreateGlobalCoupon);
  router.put('/marketplace/admin/global-coupon/:id', ...protectedRoute, globalCouponController.adminUpdateGlobalCoupon);
  router.delete('/marketplace/admin/global-coupon/:id', ...protectedRoute, globalCouponController.adminDeleteGlobalCoupon);
  router.get('/marketplace/admin/product/:productId/content', ...protectedRoute, productController.adminGetProductContent);
  router.get('/marketplace/admin/product/:productId/file/:fileId', ...protectedRoute, productController.adminDownloadProductFile);
  router.post('/marketplace/admin/product/:productId/approve', ...protectedRoute, productController.approveProduct);
  router.post('/marketplace/admin/product/:productId/reject', ...protectedRoute, productController.rejectProduct);
  router.post('/marketplace/admin/product/:productId/request-adjustment', ...protectedRoute, productController.requestAdjustment);
  router.get('/marketplace/admin/orders', ...protectedRoute, orderController.adminListOrders);
  router.post('/marketplace/admin/review/:reviewId/approve', ...protectedRoute, reviewController.approveReview);
  router.post('/marketplace/admin/review/:reviewId/reject', ...protectedRoute, reviewController.rejectReview);
  router.get('/marketplace/admin/disputes', ...protectedRoute, disputeController.listDisputes);
  router.post('/marketplace/admin/dispute/:orderId/resolve', ...protectedRoute, disputeController.resolveDispute);
  router.get('/marketplace/admin/banners', ...protectedRoute, bannerController.adminListBanners);
  router.post('/marketplace/admin/banner', ...protectedRoute, bannerController.createBanner);
  router.put('/marketplace/admin/banner/:bannerId', ...protectedRoute, bannerController.updateBanner);
  router.delete('/marketplace/admin/banner/:bannerId', ...protectedRoute, bannerController.deleteBanner);
}
