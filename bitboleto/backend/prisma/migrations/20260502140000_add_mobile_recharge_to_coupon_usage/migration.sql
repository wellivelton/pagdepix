-- AlterTable: add mobileRechargeId to CouponUsage to track coupon use on Mobile Recharge orders
ALTER TABLE "CouponUsage" ADD COLUMN "mobileRechargeId" TEXT;
