-- CreateTable
CREATE TABLE "geradepix_withdrawals" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "geradepixWithdrawalId" TEXT NOT NULL,
    "amountBrl" DOUBLE PRECISION NOT NULL,
    "pixKey" TEXT NOT NULL,
    "pixKeyType" TEXT,
    "depositAddress" TEXT NOT NULL,
    "depositAmount" DOUBLE PRECISION NOT NULL,
    "expiration" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "geradepix_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "geradepix_withdrawals_withdrawalId_key" ON "geradepix_withdrawals"("withdrawalId");

-- CreateIndex
CREATE INDEX "geradepix_withdrawals_withdrawalId_idx" ON "geradepix_withdrawals"("withdrawalId");

-- CreateIndex
CREATE INDEX "geradepix_withdrawals_geradepixWithdrawalId_idx" ON "geradepix_withdrawals"("geradepixWithdrawalId");

-- CreateIndex
CREATE INDEX "geradepix_withdrawals_status_idx" ON "geradepix_withdrawals"("status");

-- AddForeignKey
ALTER TABLE "geradepix_withdrawals" ADD CONSTRAINT "geradepix_withdrawals_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
