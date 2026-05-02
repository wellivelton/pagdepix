-- CreateTable
CREATE TABLE "DepixOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "totalToPay" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepixOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepixOrder_userId_idx" ON "DepixOrder"("userId");

-- CreateIndex
CREATE INDEX "DepixOrder_createdAt_idx" ON "DepixOrder"("createdAt");

-- AddForeignKey
ALTER TABLE "DepixOrder" ADD CONSTRAINT "DepixOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
