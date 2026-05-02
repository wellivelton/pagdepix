/*
  Warnings:

  - A unique constraint covering the columns `[txid]` on the table `Boleto` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telegram]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Made the column `dailyLimit` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
ALTER TYPE "BoletoStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'AFFILIATE';

-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "totalEarned" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Boleto" ADD COLUMN     "affiliateId" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "couponUsed" TEXT,
ADD COLUMN     "problemReason" TEXT,
ADD COLUMN     "qrCode" TEXT,
ALTER COLUMN "txid" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "usageCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "affiliateId" DROP NOT NULL,
ALTER COLUMN "discount" SET DEFAULT 0.005,
ALTER COLUMN "commission" SET DEFAULT 0.005;

-- AlterTable
ALTER TABLE "Log" ADD COLUMN     "details" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginIp" TEXT,
ADD COLUMN     "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "dailyLimit" SET NOT NULL,
ALTER COLUMN "dailyLimit" SET DEFAULT 5000;

-- CreateTable
CREATE TABLE "AffiliateTransaction" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "boletoId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedIp" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "BlockedIp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffiliateTransaction_affiliateId_createdAt_idx" ON "AffiliateTransaction"("affiliateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedIp_ip_key" ON "BlockedIp"("ip");

-- CreateIndex
CREATE INDEX "BlockedIp_ip_idx" ON "BlockedIp"("ip");

-- CreateIndex
CREATE UNIQUE INDEX "Boleto_txid_key" ON "Boleto"("txid");

-- CreateIndex
CREATE INDEX "Boleto_userId_status_idx" ON "Boleto"("userId", "status");

-- CreateIndex
CREATE INDEX "Boleto_status_createdAt_idx" ON "Boleto"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Log_userId_createdAt_idx" ON "Log"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Log_action_createdAt_idx" ON "Log"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegram_key" ON "User"("telegram");

-- AddForeignKey
ALTER TABLE "Boleto" ADD CONSTRAINT "Boleto_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boleto" ADD CONSTRAINT "Boleto_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateTransaction" ADD CONSTRAINT "AffiliateTransaction_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateTransaction" ADD CONSTRAINT "AffiliateTransaction_boletoId_fkey" FOREIGN KEY ("boletoId") REFERENCES "Boleto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
