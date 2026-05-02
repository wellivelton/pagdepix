-- AlterTable: tornar boletoId opcional e adicionar campos para recargas e Depix
ALTER TABLE "AffiliateTransaction" 
  ALTER COLUMN "boletoId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "mobileRechargeId" TEXT,
  ADD COLUMN IF NOT EXISTS "depixOrderId" TEXT;

-- Adicionar foreign keys
ALTER TABLE "AffiliateTransaction" 
  ADD CONSTRAINT "AffiliateTransaction_mobileRechargeId_fkey" 
  FOREIGN KEY ("mobileRechargeId") REFERENCES "MobileRecharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliateTransaction" 
  ADD CONSTRAINT "AffiliateTransaction_depixOrderId_fkey" 
  FOREIGN KEY ("depixOrderId") REFERENCES "DepixOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Adicionar campos de cupom e afiliado em DepixOrder
ALTER TABLE "DepixOrder" 
  ADD COLUMN IF NOT EXISTS "couponId" TEXT,
  ADD COLUMN IF NOT EXISTS "affiliateId" TEXT;

-- Adicionar foreign keys em DepixOrder
ALTER TABLE "DepixOrder" 
  ADD CONSTRAINT "DepixOrder_couponId_fkey" 
  FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DepixOrder" 
  ADD CONSTRAINT "DepixOrder_affiliateId_fkey" 
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Criar índices
CREATE INDEX IF NOT EXISTS "AffiliateTransaction_mobileRechargeId_idx" ON "AffiliateTransaction"("mobileRechargeId");
CREATE INDEX IF NOT EXISTS "AffiliateTransaction_depixOrderId_idx" ON "AffiliateTransaction"("depixOrderId");
CREATE INDEX IF NOT EXISTS "DepixOrder_couponId_idx" ON "DepixOrder"("couponId");
CREATE INDEX IF NOT EXISTS "DepixOrder_affiliateId_idx" ON "DepixOrder"("affiliateId");
