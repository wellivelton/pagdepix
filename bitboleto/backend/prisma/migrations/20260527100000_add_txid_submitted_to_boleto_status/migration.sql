-- Add TXID_SUBMITTED to BoletoStatus enum
-- This value was already being used by syncLiquidPayments.ts but was missing from the enum definition.

ALTER TYPE "BoletoStatus" ADD VALUE IF NOT EXISTS 'TXID_SUBMITTED' BEFORE 'PAID';
