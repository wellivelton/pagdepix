-- CreateTable
CREATE TABLE IF NOT EXISTS "CommercePage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CommercePage_slug_key" ON "CommercePage"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CommercePage_userId_idx" ON "CommercePage"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CommercePage_slug_idx" ON "CommercePage"("slug");

-- AddForeignKey
ALTER TABLE "CommercePage" ADD CONSTRAINT "CommercePage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "commercePageId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DepixOrder_commercePageId_idx" ON "DepixOrder"("commercePageId");

-- AddForeignKey
ALTER TABLE "DepixOrder" ADD CONSTRAINT "DepixOrder_commercePageId_fkey" FOREIGN KEY ("commercePageId") REFERENCES "CommercePage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
