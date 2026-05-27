-- Migration: add_sideswap_refund_fields
-- Adds refundAddress and refundRequestAt to sideswap_swaps
-- These fields were in schema.prisma but missing from the original migration.

ALTER TABLE "sideswap_swaps"
  ADD COLUMN IF NOT EXISTS "refundAddress"   TEXT,
  ADD COLUMN IF NOT EXISTS "refundRequestAt" TIMESTAMPTZ;
