-- CreateTable
CREATE TABLE "CommerceSettings" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "businessName" TEXT,
    "cnpj" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "useCustomBranding" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommerceSettings_partnerId_key" ON "CommerceSettings"("partnerId");

-- CreateIndex
CREATE INDEX "CommerceSettings_partnerId_idx" ON "CommerceSettings"("partnerId");

-- AddForeignKey
ALTER TABLE "CommerceSettings" ADD CONSTRAINT "CommerceSettings_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "CommercePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
