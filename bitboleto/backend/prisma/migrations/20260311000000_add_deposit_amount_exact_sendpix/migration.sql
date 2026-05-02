-- AlterTable: adiciona coluna depositAmountExact para valor exato da API GeraDePix
ALTER TABLE "send_pix_orders" ADD COLUMN IF NOT EXISTS "depositAmountExact" TEXT;
