-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN     "lastWalletChange" TIMESTAMP(3),
ADD COLUMN     "liquidWallet" TEXT,
ADD COLUMN     "pendingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AffiliateTransaction" ADD COLUMN     "availableAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deviceFingerprint" TEXT,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "telegramVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CouponUsage" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "userTelegram" TEXT NOT NULL,
    "userIp" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "boletoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountCreation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountCreation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "liquidWallet" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CouponUsage_couponId_createdAt_idx" ON "CouponUsage"("couponId", "createdAt");

-- CreateIndex
CREATE INDEX "CouponUsage_userEmail_createdAt_idx" ON "CouponUsage"("userEmail", "createdAt");

-- CreateIndex
CREATE INDEX "CouponUsage_userTelegram_createdAt_idx" ON "CouponUsage"("userTelegram", "createdAt");

-- CreateIndex
CREATE INDEX "CouponUsage_userIp_createdAt_idx" ON "CouponUsage"("userIp", "createdAt");

-- CreateIndex
CREATE INDEX "CouponUsage_deviceFingerprint_createdAt_idx" ON "CouponUsage"("deviceFingerprint", "createdAt");

-- CreateIndex
CREATE INDEX "AccountCreation_ip_createdAt_idx" ON "AccountCreation"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "AccountCreation_deviceFingerprint_createdAt_idx" ON "AccountCreation"("deviceFingerprint", "createdAt");

-- CreateIndex
CREATE INDEX "AccountCreation_createdAt_idx" ON "AccountCreation"("createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_affiliateId_status_idx" ON "Withdrawal"("affiliateId", "status");

-- CreateIndex
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateTransaction_status_idx" ON "AffiliateTransaction"("status");

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountCreation" ADD CONSTRAINT "AccountCreation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
