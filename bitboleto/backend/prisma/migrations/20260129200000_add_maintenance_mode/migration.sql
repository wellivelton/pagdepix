-- AlterTable
ALTER TABLE "config" ADD COLUMN IF NOT EXISTS "maintenanceMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "config" ADD COLUMN IF NOT EXISTS "maintenanceMessage" TEXT;
ALTER TABLE "config" ADD COLUMN IF NOT EXISTS "maintenanceUpdatedAt" TIMESTAMP(3);
ALTER TABLE "config" ADD COLUMN IF NOT EXISTS "maintenanceUpdatedBy" TEXT;
