-- CreateTable
CREATE TABLE "CommerceLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommerceLink_slug_key" ON "CommerceLink"("slug");

-- CreateIndex
CREATE INDEX "CommerceLink_userId_idx" ON "CommerceLink"("userId");

-- CreateIndex
CREATE INDEX "CommerceLink_slug_idx" ON "CommerceLink"("slug");

-- AddForeignKey
ALTER TABLE "CommerceLink" ADD CONSTRAINT "CommerceLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
