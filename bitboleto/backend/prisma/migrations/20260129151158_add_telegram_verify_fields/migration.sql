-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramVerifyExpires" TIMESTAMP(3),
ADD COLUMN     "telegramVerifyToken" TEXT;
