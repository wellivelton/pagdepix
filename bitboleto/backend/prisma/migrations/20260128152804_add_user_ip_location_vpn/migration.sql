-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginCity" TEXT,
ADD COLUMN     "lastLoginCountry" TEXT,
ADD COLUMN     "lastLoginIsVpn" BOOLEAN DEFAULT false;
