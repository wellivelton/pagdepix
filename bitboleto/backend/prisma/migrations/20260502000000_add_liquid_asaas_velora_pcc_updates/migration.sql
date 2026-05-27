-- Migration: add_liquid_asaas_velora_pcc_updates
-- Covers changes NOT yet in prior migrations:
--   * PixCopiaColaStatus: +ASAAS_PROCESSING, +CANCELLED
--   * Boleto:             +liquidAddressIndex
--   * MobileRecharge:     +liquidAddressIndex
--   * PixCopiaCola:       Float→Decimal on financial columns, +taxaFixa,
--                         +Velora fields, +Asaas fields, +liquidAddressIndex,
--                         +cancelledAt, +cancelReason
--   * BoletoBatch:        +liquidAddressIndex
--
-- NOT included (already applied):
--   * MobileRechargeStatus +PROCESSING       (20260501000000)
--   * MobileRecharge +asaasRechargeId/Status (20260501000000)
--   * PixCopiaColaStatus +VELORA_PROCESSING  (20260430000000)

-- ─── PixCopiaColaStatus enum ─────────────────────────────────────────────────

ALTER TYPE "PixCopiaColaStatus" ADD VALUE IF NOT EXISTS 'ASAAS_PROCESSING';
ALTER TYPE "PixCopiaColaStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ─── Boleto ──────────────────────────────────────────────────────────────────

ALTER TABLE "Boleto" ADD COLUMN IF NOT EXISTS "liquidAddressIndex" INTEGER;

-- ─── MobileRecharge ──────────────────────────────────────────────────────────

ALTER TABLE "MobileRecharge" ADD COLUMN IF NOT EXISTS "liquidAddressIndex" INTEGER;
ALTER TABLE "MobileRecharge" ADD CONSTRAINT "MobileRecharge_liquidAddressIndex_key" UNIQUE ("liquidAddressIndex");

-- ─── BoletoBatch ─────────────────────────────────────────────────────────────

ALTER TABLE "BoletoBatch" ADD COLUMN IF NOT EXISTS "liquidAddressIndex" INTEGER;
ALTER TABLE "BoletoBatch" ADD CONSTRAINT "BoletoBatch_liquidAddressIndex_key" UNIQUE ("liquidAddressIndex");

-- ─── PixCopiaCola — new columns ──────────────────────────────────────────────

ALTER TABLE "PixCopiaCola"
  ADD COLUMN IF NOT EXISTS "taxaFixa"          DECIMAL(5,2)  NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS "veloraExternalId"  TEXT,
  ADD COLUMN IF NOT EXISTS "veloraStatus"      TEXT,
  ADD COLUMN IF NOT EXISTS "paidViaVelora"     BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "asaasExternalId"   TEXT,
  ADD COLUMN IF NOT EXISTS "asaasStatus"       TEXT,
  ADD COLUMN IF NOT EXISTS "paidViaAsaas"      BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cancelledAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelReason"      TEXT;

ALTER TABLE "PixCopiaCola" ADD COLUMN IF NOT EXISTS "liquidAddressIndex" INTEGER;
ALTER TABLE "PixCopiaCola" ADD CONSTRAINT "PixCopiaCola_liquidAddressIndex_key" UNIQUE ("liquidAddressIndex");

-- ─── PixCopiaCola — Float → Decimal on financial columns ─────────────────────
-- USING clause required: PostgreSQL needs explicit cast from double precision.
-- Existing rows: values are preserved; precision loss only if value had >12
-- integer digits (impossible for BRL amounts in this system).

ALTER TABLE "PixCopiaCola"
  ALTER COLUMN "valorOriginal" TYPE DECIMAL(12,2) USING "valorOriginal"::DECIMAL(12,2),
  ALTER COLUMN "taxa"          TYPE DECIMAL(8,6)  USING "taxa"::DECIMAL(8,6),
  ALTER COLUMN "valorTaxa"     TYPE DECIMAL(12,2) USING "valorTaxa"::DECIMAL(12,2),
  ALTER COLUMN "totalFinal"    TYPE DECIMAL(12,2) USING "totalFinal"::DECIMAL(12,2);

ALTER TABLE "PixCopiaCola"
  ALTER COLUMN "exchangeRate" TYPE DECIMAL(18,8) USING "exchangeRate"::DECIMAL(18,8);
