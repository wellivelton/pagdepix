-- AlterTable
ALTER TABLE "CommerceCharge" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'link';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CommerceCharge_source_idx" ON "CommerceCharge"("source");
