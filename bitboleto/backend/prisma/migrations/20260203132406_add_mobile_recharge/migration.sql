-- CreateEnum
CREATE TYPE "MobileRechargeStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "MobileRecharge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "depixAmount" DOUBLE PRECISION NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "status" "MobileRechargeStatus" NOT NULL DEFAULT 'PENDING',
    "affiliateId" TEXT,
    "couponUsed" TEXT,
    "couponId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "MobileRecharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MobileRecharge_userId_status_idx" ON "MobileRecharge"("userId", "status");

-- CreateIndex
CREATE INDEX "MobileRecharge_status_createdAt_idx" ON "MobileRecharge"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "MobileRecharge" ADD CONSTRAINT "MobileRecharge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileRecharge" ADD CONSTRAINT "MobileRecharge_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileRecharge" ADD CONSTRAINT "MobileRecharge_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
