-- AlterTable
ALTER TABLE "CommerceSettings" ADD COLUMN IF NOT EXISTS "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "emailNotifiedAt" TIMESTAMP(3);
