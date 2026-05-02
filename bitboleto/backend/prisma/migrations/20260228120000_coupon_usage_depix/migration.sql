-- AlterTable: CouponUsage - boletoId opcional, adicionar depixOrderId para Receber Pix
ALTER TABLE "CouponUsage" ALTER COLUMN "boletoId" DROP NOT NULL;
ALTER TABLE "CouponUsage" ADD COLUMN "depixOrderId" TEXT;
