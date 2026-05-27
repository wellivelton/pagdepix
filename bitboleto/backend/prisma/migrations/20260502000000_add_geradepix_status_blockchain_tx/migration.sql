-- AlterTable: adiciona geradepixStatus e blockchainTxId em send_pix_orders
ALTER TABLE "send_pix_orders" ADD COLUMN "geradepixStatus" TEXT;
ALTER TABLE "send_pix_orders" ADD COLUMN "blockchainTxId" TEXT;
