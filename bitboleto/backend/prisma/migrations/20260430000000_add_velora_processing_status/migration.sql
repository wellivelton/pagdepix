-- Add VELORA_PROCESSING to PixCopiaColaStatus enum
-- This intermediate state enables crash recovery: if the server dies after Velora
-- sends the PIX but before the order is marked APPROVED, the reconciliation job
-- can detect and finalize these orders safely.

ALTER TYPE "PixCopiaColaStatus" ADD VALUE IF NOT EXISTS 'VELORA_PROCESSING';
