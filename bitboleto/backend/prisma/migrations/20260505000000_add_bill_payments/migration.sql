-- CreateEnum
CREATE TYPE "BillPaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "BillPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "barcode" TEXT,
    "digitableLine" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "depixAmount" DOUBLE PRECISION NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "status" "BillPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "txid" TEXT,
    "receiptUrl" TEXT,
    "rvhubPaymentId" TEXT,
    "rvhubStatus" TEXT,
    "rvhubDueDate" TIMESTAMP(3),
    "rvhubPaymentLimitDate" TIMESTAMP(3),
    "rvhubPayeeName" TEXT,
    "rvhubPayeeCompany" TEXT,
    "couponUsed" TEXT,
    "couponId" TEXT,
    "affiliateId" TEXT,
    "paymentCurrency" "PaymentCurrency" NOT NULL DEFAULT 'DEPIX',
    "exchangeRate" DOUBLE PRECISION,
    "cryptoAmount" TEXT,
    "rateLockExpiresAt" TIMESTAMP(3),
    "rateExpired" BOOLEAN NOT NULL DEFAULT false,
    "liquidAddressIndex" INTEGER,
    "userIp" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillPayment_txid_key" ON "BillPayment"("txid");

-- CreateIndex
CREATE UNIQUE INDEX "BillPayment_liquidAddressIndex_key" ON "BillPayment"("liquidAddressIndex");

-- CreateIndex
CREATE INDEX "BillPayment_userId_status_idx" ON "BillPayment"("userId", "status");

-- CreateIndex
CREATE INDEX "BillPayment_status_createdAt_idx" ON "BillPayment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BillPayment_rvhubPaymentId_idx" ON "BillPayment"("rvhubPaymentId");

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add billPaymentId to AffiliateTransaction
ALTER TABLE "AffiliateTransaction" ADD COLUMN "billPaymentId" TEXT;

-- AlterTable: add billPaymentId to CouponUsage
ALTER TABLE "CouponUsage" ADD COLUMN "billPaymentId" TEXT;

-- AddForeignKey
ALTER TABLE "AffiliateTransaction" ADD CONSTRAINT "AffiliateTransaction_billPaymentId_fkey" FOREIGN KEY ("billPaymentId") REFERENCES "BillPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AffiliateTransaction_billPaymentId_idx" ON "AffiliateTransaction"("billPaymentId");
