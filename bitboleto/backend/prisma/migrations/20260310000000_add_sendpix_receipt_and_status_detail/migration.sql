-- AlterTable
ALTER TABLE "send_pix_orders" ADD COLUMN IF NOT EXISTS "statusDetail" TEXT;
ALTER TABLE "send_pix_orders" ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;
