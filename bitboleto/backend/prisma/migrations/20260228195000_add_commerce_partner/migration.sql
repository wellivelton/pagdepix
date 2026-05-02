-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COMMERCE';

-- CreateTable
CREATE TABLE "CommercePartner" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercePartner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommercePartner_userId_key" ON "CommercePartner"("userId");

-- CreateIndex
CREATE INDEX "CommercePartner_userId_idx" ON "CommercePartner"("userId");

-- CreateIndex
CREATE INDEX "CommercePartner_status_idx" ON "CommercePartner"("status");

-- AddForeignKey
ALTER TABLE "CommercePartner" ADD CONSTRAINT "CommercePartner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
