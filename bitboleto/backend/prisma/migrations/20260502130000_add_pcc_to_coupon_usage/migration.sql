-- AlterTable: add pixCopiaColaId to CouponUsage to track coupon use on Pix Copia e Cola orders
ALTER TABLE "CouponUsage" ADD COLUMN "pixCopiaColaId" TEXT;
