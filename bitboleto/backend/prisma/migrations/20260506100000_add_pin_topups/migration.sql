CREATE TYPE "PinTopupStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'CANCELLED', 'FAILED', 'EXPIRED');

CREATE TABLE "PinTopup" (
  "id"                 TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "productId"          TEXT NOT NULL,
  "productName"        TEXT NOT NULL,
  "brand"              TEXT NOT NULL,
  "amount"             DOUBLE PRECISION NOT NULL,
  "fee"                DOUBLE PRECISION NOT NULL,
  "totalAmount"        DOUBLE PRECISION NOT NULL,
  "depixAmount"        DOUBLE PRECISION NOT NULL,
  "walletAddress"      TEXT NOT NULL,
  "liquidAddressIndex" INTEGER,
  "paymentCurrency"    "PaymentCurrency" NOT NULL DEFAULT 'DEPIX',
  "exchangeRate"       DOUBLE PRECISION,
  "cryptoAmount"       TEXT,
  "rateLockExpiresAt"  TIMESTAMP(3),
  "rateExpired"        BOOLEAN NOT NULL DEFAULT false,
  "txid"               TEXT,
  "status"             "PinTopupStatus" NOT NULL DEFAULT 'PENDING',
  "pinCode"            TEXT,
  "pinMessage"         TEXT,
  "rvhubTransactionId" TEXT,
  "rvhubStatus"        TEXT,
  "authorizationCode"  TEXT,
  "serialNumber"       TEXT,
  "couponUsed"         TEXT,
  "couponId"           TEXT,
  "affiliateId"        TEXT,
  "userIp"             TEXT NOT NULL DEFAULT '',
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt"             TIMESTAMP(3),
  CONSTRAINT "PinTopup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PinTopup_liquidAddressIndex_key" ON "PinTopup"("liquidAddressIndex");
CREATE UNIQUE INDEX "PinTopup_txid_key" ON "PinTopup"("txid");
CREATE INDEX "PinTopup_userId_status_idx" ON "PinTopup"("userId", "status");
CREATE INDEX "PinTopup_status_createdAt_idx" ON "PinTopup"("status", "createdAt");

ALTER TABLE "PinTopup" ADD CONSTRAINT "PinTopup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PinTopup" ADD CONSTRAINT "PinTopup_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PinTopup" ADD CONSTRAINT "PinTopup_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliateTransaction" ADD COLUMN IF NOT EXISTS "pinTopupId" TEXT;
CREATE INDEX IF NOT EXISTS "AffiliateTransaction_pinTopupId_idx" ON "AffiliateTransaction"("pinTopupId");
ALTER TABLE "AffiliateTransaction" ADD CONSTRAINT "AffiliateTransaction_pinTopupId_fkey" FOREIGN KEY ("pinTopupId") REFERENCES "PinTopup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
