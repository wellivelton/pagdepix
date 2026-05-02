-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('EBOOK', 'SOFTWARE', 'COURSE', 'DESIGN', 'GIFTCARD');
CREATE TYPE "DeliveryType" AS ENUM ('FILE', 'CODE', 'LINK');
CREATE TYPE "ProductStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'INACTIVE');

-- CreateTable Product
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(250) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "priceInDepix" DOUBLE PRECISION NOT NULL,
    "coverImageUrl" VARCHAR(500),
    "deliveryType" "DeliveryType" NOT NULL,
    "deliveryLink" VARCHAR(500),
    "allowAffiliates" BOOLEAN NOT NULL DEFAULT false,
    "affiliateCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ProductStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "purchaseCount" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable ProductFile
CREATE TABLE "ProductFile" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "filePath" VARCHAR(500) NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "mimeType" VARCHAR(100),
    "fileHash" VARCHAR(64),
    "virusScanStatus" TEXT NOT NULL DEFAULT 'pending',
    "virusScanResult" TEXT,
    "virusScanAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable MarketplaceOrder
CREATE TABLE "MarketplaceOrder" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "productPrice" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "platformFixedFee" DOUBLE PRECISION NOT NULL,
    "affiliateCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "couponDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalPrice" DOUBLE PRECISION NOT NULL,
    "sellerReceives" DOUBLE PRECISION NOT NULL,
    "swapverseOrderId" VARCHAR(100),
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "deliveredAt" TIMESTAMP(3),
    "deliveredCode" VARCHAR(500),
    "downloadLink" TEXT,
    "downloadLinkExpiry" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "downloadLimit" INTEGER NOT NULL DEFAULT 3,
    "disputeStatus" TEXT,
    "disputeReason" TEXT,
    "disputeOpenedAt" TIMESTAMP(3),
    "disputeResolvedAt" TIMESTAMP(3),
    "disputeResolvedBy" TEXT,
    "disputeAdminNotes" TEXT,
    "settlementStatus" TEXT NOT NULL DEFAULT 'pending',
    "settlementAvailableAt" TIMESTAMP(3),
    "settlementPaidAt" TIMESTAMP(3),
    "couponId" TEXT,
    "affiliateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable ProductCode
CREATE TABLE "ProductCode" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" VARCHAR(500) NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "usedByOrderId" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable ProductReview
CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable SellerCoupon
CREATE TABLE "SellerCoupon" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "productId" TEXT,
    "code" VARCHAR(50) NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "maxUsage" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable MarketplaceBanner
CREATE TABLE "MarketplaceBanner" (
    "id" TEXT NOT NULL,
    "desktopImageUrl" VARCHAR(500) NOT NULL,
    "desktopLinkType" VARCHAR(20) NOT NULL,
    "desktopLinkTarget" VARCHAR(500),
    "mobileImageUrl" VARCHAR(500) NOT NULL,
    "mobileLinkType" VARCHAR(20) NOT NULL,
    "mobileLinkTarget" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceBanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable SellerBalance
CREATE TABLE "SellerBalance" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "availableBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lockedBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "liquidWallet" VARCHAR(100),
    "lastWalletChange" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable SellerWithdrawal
CREATE TABLE "SellerWithdrawal" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "liquidWallet" VARCHAR(100) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "txid" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SellerWithdrawal_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE UNIQUE INDEX "MarketplaceOrder_swapverseOrderId_key" ON "MarketplaceOrder"("swapverseOrderId");
CREATE UNIQUE INDEX "ProductReview_orderId_key" ON "ProductReview"("orderId");
CREATE UNIQUE INDEX "SellerCoupon_code_key" ON "SellerCoupon"("code");
CREATE UNIQUE INDEX "SellerBalance_sellerId_key" ON "SellerBalance"("sellerId");

-- Indexes
CREATE INDEX "Product_sellerId_status_idx" ON "Product"("sellerId", "status");
CREATE INDEX "Product_category_status_idx" ON "Product"("category", "status");
CREATE INDEX "Product_slug_idx" ON "Product"("slug");
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");
CREATE INDEX "ProductFile_productId_idx" ON "ProductFile"("productId");
CREATE INDEX "ProductCode_productId_isUsed_idx" ON "ProductCode"("productId", "isUsed");
CREATE INDEX "MarketplaceOrder_buyerId_paymentStatus_idx" ON "MarketplaceOrder"("buyerId", "paymentStatus");
CREATE INDEX "MarketplaceOrder_sellerId_settlementStatus_idx" ON "MarketplaceOrder"("sellerId", "settlementStatus");
CREATE INDEX "MarketplaceOrder_productId_idx" ON "MarketplaceOrder"("productId");
CREATE INDEX "MarketplaceOrder_paymentStatus_idx" ON "MarketplaceOrder"("paymentStatus");
CREATE INDEX "MarketplaceOrder_settlementStatus_idx" ON "MarketplaceOrder"("settlementStatus");
CREATE INDEX "MarketplaceOrder_disputeStatus_idx" ON "MarketplaceOrder"("disputeStatus");
CREATE INDEX "MarketplaceOrder_createdAt_idx" ON "MarketplaceOrder"("createdAt");
CREATE INDEX "ProductReview_productId_isApproved_idx" ON "ProductReview"("productId", "isApproved");
CREATE INDEX "ProductReview_userId_idx" ON "ProductReview"("userId");
CREATE INDEX "SellerCoupon_sellerId_idx" ON "SellerCoupon"("sellerId");
CREATE INDEX "SellerCoupon_code_isActive_idx" ON "SellerCoupon"("code", "isActive");
CREATE INDEX "MarketplaceBanner_isActive_displayOrder_idx" ON "MarketplaceBanner"("isActive", "displayOrder");
CREATE INDEX "SellerBalance_sellerId_idx" ON "SellerBalance"("sellerId");
CREATE INDEX "SellerWithdrawal_sellerId_status_idx" ON "SellerWithdrawal"("sellerId", "status");
CREATE INDEX "SellerWithdrawal_status_createdAt_idx" ON "SellerWithdrawal"("status", "createdAt");

-- Foreign keys
ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductFile" ADD CONSTRAINT "ProductFile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_disputeResolvedBy_fkey" FOREIGN KEY ("disputeResolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "SellerCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductCode" ADD CONSTRAINT "ProductCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCode" ADD CONSTRAINT "ProductCode_usedByOrderId_fkey" FOREIGN KEY ("usedByOrderId") REFERENCES "MarketplaceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SellerCoupon" ADD CONSTRAINT "SellerCoupon_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerCoupon" ADD CONSTRAINT "SellerCoupon_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SellerBalance" ADD CONSTRAINT "SellerBalance_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerWithdrawal" ADD CONSTRAINT "SellerWithdrawal_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
