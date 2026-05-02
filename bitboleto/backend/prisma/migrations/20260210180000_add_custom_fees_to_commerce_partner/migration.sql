-- AlterTable: Adicionar campos de taxas personalizadas para comerciantes
ALTER TABLE "CommercePartner" ADD COLUMN IF NOT EXISTS "useCustomFees" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CommercePartner" ADD COLUMN IF NOT EXISTS "customFixedFee" DOUBLE PRECISION;
ALTER TABLE "CommercePartner" ADD COLUMN IF NOT EXISTS "customVariablePercent" DOUBLE PRECISION;
