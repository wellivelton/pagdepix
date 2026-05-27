-- CreateTable
CREATE TABLE "rvhub_providers" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rvhub_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rvhub_products" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "variable" BOOLEAN NOT NULL DEFAULT false,
    "minAmount" DOUBLE PRECISION,
    "maxAmount" DOUBLE PRECISION,
    "areaCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "removedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rvhub_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rvhub_providers_externalId_key" ON "rvhub_providers"("externalId");

-- CreateIndex
CREATE INDEX "rvhub_providers_kind_active_idx" ON "rvhub_providers"("kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "rvhub_products_productId_key" ON "rvhub_products"("productId");

-- CreateIndex
CREATE INDEX "rvhub_products_kind_active_idx" ON "rvhub_products"("kind", "active");

-- CreateIndex
CREATE INDEX "rvhub_products_providerId_idx" ON "rvhub_products"("providerId");

-- AddForeignKey
ALTER TABLE "rvhub_products" ADD CONSTRAINT "rvhub_products_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "rvhub_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
