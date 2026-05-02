-- CreateTable: AffiliateApiConfig (1:1 com Affiliate, controla status da integração)
CREATE TABLE IF NOT EXISTS "affiliate_api_configs" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "globalDailyLimitPerUser" DOUBLE PRECISION NOT NULL DEFAULT 1000.00,
    "maxDailyVolumeAffiliate" DOUBLE PRECISION,
    "activatedAt" TIMESTAMP(3),
    "activatedByAdminId" TEXT,
    "activatedByAdminEmail" TEXT,
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "blockedByAdminId" TEXT,
    "blockedByAdminEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_api_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ApiEndUserLimit (limites por usuário final do afiliado)
CREATE TABLE IF NOT EXISTS "api_end_user_limits" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "userRef" TEXT NOT NULL,
    "dailyLimit" DOUBLE PRECISION,
    "customLimitReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "blockedReason" TEXT,
    "blockedAt" TIMESTAMP(3),
    "blockedByAdminId" TEXT,
    "blockedByAdminEmail" TEXT,
    "usedToday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUsageDate" TEXT,
    "usedThisMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthResetDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_end_user_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_api_configs_affiliateId_key" ON "affiliate_api_configs"("affiliateId");
CREATE INDEX IF NOT EXISTS "affiliate_api_configs_status_idx" ON "affiliate_api_configs"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "api_end_user_limits_affiliateId_userRef_key" ON "api_end_user_limits"("affiliateId", "userRef");
CREATE INDEX IF NOT EXISTS "api_end_user_limits_affiliateId_idx" ON "api_end_user_limits"("affiliateId");
CREATE INDEX IF NOT EXISTS "api_end_user_limits_lastUsageDate_idx" ON "api_end_user_limits"("lastUsageDate");

-- AddForeignKey
ALTER TABLE "affiliate_api_configs" ADD CONSTRAINT "affiliate_api_configs_affiliateId_fkey"
    FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_end_user_limits" ADD CONSTRAINT "api_end_user_limits_affiliateId_fkey"
    FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
