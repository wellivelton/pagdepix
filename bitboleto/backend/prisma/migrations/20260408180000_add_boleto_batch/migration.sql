-- CreateTable
CREATE TABLE "boleto_batches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "totalBoletos" DOUBLE PRECISION NOT NULL,
    "totalFee" DOUBLE PRECISION NOT NULL,
    "grandTotal" DOUBLE PRECISION NOT NULL,
    "walletAddress" TEXT,
    "qrCode" TEXT,
    "paymentCurrency" TEXT NOT NULL DEFAULT 'DEPIX',
    "cryptoAmount" TEXT,
    "depixAmount" DOUBLE PRECISION,
    "exchangeRate" DOUBLE PRECISION,
    "rateLockExpiresAt" TIMESTAMP(3),
    "couponCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "txid" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "boleto_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "boleto_batches_txid_key" ON "boleto_batches"("txid");
CREATE INDEX "boleto_batches_userId_idx" ON "boleto_batches"("userId");
CREATE INDEX "boleto_batches_status_idx" ON "boleto_batches"("status");

-- AlterTable Boleto: add batchId
ALTER TABLE "Boleto" ADD COLUMN "batchId" TEXT;
CREATE INDEX "Boleto_batchId_idx" ON "Boleto"("batchId");

-- AddForeignKey boleto_batches → User
ALTER TABLE "boleto_batches" ADD CONSTRAINT "boleto_batches_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey Boleto → boleto_batches
ALTER TABLE "Boleto" ADD CONSTRAINT "Boleto_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "boleto_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
