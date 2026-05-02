-- AddColumn referralCode to User
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_referralCode_key" UNIQUE ("referralCode");

-- AddColumn referredByCode to User
ALTER TABLE "User" ADD COLUMN "referredByCode" TEXT;

-- Gerar referralCode único para todos os usuários existentes
UPDATE "User"
SET "referralCode" = UPPER(SUBSTRING(MD5(id || CAST(EXTRACT(EPOCH FROM "createdAt") AS TEXT)), 1, 8))
WHERE "referralCode" IS NULL;

-- CreateTable ReferralEarning
CREATE TABLE "referral_earnings" (
    "id" TEXT NOT NULL,
    "earnerId" TEXT NOT NULL,
    "sourceUserId" TEXT NOT NULL,
    "boletoId" TEXT,
    "rechargeId" TEXT,
    "feeAmount" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_earnings_earnerId_idx" ON "referral_earnings"("earnerId");
CREATE INDEX "referral_earnings_sourceUserId_idx" ON "referral_earnings"("sourceUserId");

-- AddForeignKey
ALTER TABLE "referral_earnings" ADD CONSTRAINT "referral_earnings_earnerId_fkey"
    FOREIGN KEY ("earnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "referral_earnings" ADD CONSTRAINT "referral_earnings_sourceUserId_fkey"
    FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
