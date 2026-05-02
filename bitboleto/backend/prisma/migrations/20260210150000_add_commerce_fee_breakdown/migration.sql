-- AlterTable: Adicionar campos discriminados de taxas para modo comércio
ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "grossAmount" DOUBLE PRECISION;
ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "fixedFeePaid" DOUBLE PRECISION;
ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "variableFeePaid" DOUBLE PRECISION;
ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "pagdepixProfit" DOUBLE PRECISION;
ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "swapverseFee" DOUBLE PRECISION;
