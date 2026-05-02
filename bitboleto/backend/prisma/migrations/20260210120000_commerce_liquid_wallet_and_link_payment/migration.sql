-- AlterTable
ALTER TABLE "CommerceSettings" ADD COLUMN IF NOT EXISTS "liquidWallet" TEXT;

-- AlterTable
ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "commerceLinkId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DepixOrder_commerceLinkId_idx" ON "DepixOrder"("commerceLinkId");

-- AddForeignKey
ALTER TABLE "DepixOrder" ADD CONSTRAINT "DepixOrder_commerceLinkId_fkey" FOREIGN KEY ("commerceLinkId") REFERENCES "CommerceLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
