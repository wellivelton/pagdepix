-- AlterEnum
ALTER TYPE "MobileRechargeStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "MobileRecharge" ADD COLUMN "asaasRechargeId" TEXT,
                              ADD COLUMN "asaasStatus" TEXT;
