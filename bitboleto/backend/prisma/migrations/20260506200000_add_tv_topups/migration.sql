-- CreateEnum
CREATE TYPE "TvTopupStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "tv_topups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "depixAmount" DOUBLE PRECISION NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "liquidAddressIndex" INTEGER,
    "paymentCurrency" "PaymentCurrency" NOT NULL DEFAULT 'DEPIX',
    "exchangeRate" DOUBLE PRECISION,
    "cryptoAmount" TEXT,
    "txid" TEXT,
    "status" "TvTopupStatus" NOT NULL DEFAULT 'PENDING',
    "rvhubTransactionId" TEXT,
    "rvhubStatus" TEXT,
    "authorizationCode" TEXT,
    "serialNumber" TEXT,
    "userIp" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "tv_topups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tv_topups_liquidAddressIndex_key" ON "tv_topups"("liquidAddressIndex");

-- CreateIndex
CREATE UNIQUE INDEX "tv_topups_txid_key" ON "tv_topups"("txid");

-- CreateIndex
CREATE INDEX "tv_topups_userId_status_idx" ON "tv_topups"("userId", "status");

-- CreateIndex
CREATE INDEX "tv_topups_status_createdAt_idx" ON "tv_topups"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "tv_topups" ADD CONSTRAINT "tv_topups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
