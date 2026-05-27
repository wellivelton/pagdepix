-- CreateTable
CREATE TABLE "toprecargas_products" (
    "id"                TEXT NOT NULL,
    "externalId"        INTEGER NOT NULL,
    "nome"              TEXT NOT NULL,
    "descricao"         TEXT,
    "preco"             DOUBLE PRECISION NOT NULL,
    "categoria"         TEXT NOT NULL,
    "estoqueTotal"      INTEGER NOT NULL DEFAULT 0,
    "estoqueDisponivel" INTEGER NOT NULL DEFAULT 0,
    "ativo"             BOOLEAN NOT NULL DEFAULT true,
    "vendidos"          INTEGER NOT NULL DEFAULT 0,
    "mediaEstrelas"     DOUBLE PRECISION,
    "totalAvaliacoes"   INTEGER NOT NULL DEFAULT 0,
    "visivel"           BOOLEAN NOT NULL DEFAULT true,
    "removedAt"         TIMESTAMP(3),
    "rawPayload"        JSONB,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "toprecargas_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toprecargas_orders" (
    "id"                    TEXT NOT NULL,
    "userId"                TEXT NOT NULL,
    "productId"             TEXT NOT NULL,
    "externalProductId"     INTEGER NOT NULL,
    "productName"           TEXT NOT NULL,
    "productCategoria"      TEXT NOT NULL,
    "precoOriginal"         DOUBLE PRECISION NOT NULL,
    "precoFinal"            DOUBLE PRECISION NOT NULL,
    "fee"                   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount"           DOUBLE PRECISION NOT NULL,
    "depixAmount"           DOUBLE PRECISION NOT NULL,
    "walletAddress"         TEXT NOT NULL,
    "liquidAddressIndex"    INTEGER,
    "paymentCurrency"       "PaymentCurrency" NOT NULL DEFAULT 'DEPIX',
    "exchangeRate"          DOUBLE PRECISION,
    "cryptoAmount"          TEXT,
    "rateLockExpiresAt"     TIMESTAMP(3),
    "rateExpired"           BOOLEAN NOT NULL DEFAULT false,
    "txid"                  TEXT,
    "status"                TEXT NOT NULL DEFAULT 'PENDING',
    "codigoEntregue"        VARCHAR(500),
    "codigoMensagem"        TEXT,
    "toprecargasDeliveryId" TEXT,
    "deliveryAttempts"      INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryError"     TEXT,
    "deliveredAt"           TIMESTAMP(3),
    "couponUsed"            TEXT,
    "couponId"              TEXT,
    "affiliateId"           TEXT,
    "userIp"                TEXT NOT NULL DEFAULT '',
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt"                TIMESTAMP(3),

    CONSTRAINT "toprecargas_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "toprecargas_products_externalId_key" ON "toprecargas_products"("externalId");
CREATE INDEX "toprecargas_products_visivel_categoria_idx" ON "toprecargas_products"("visivel", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "toprecargas_orders_liquidAddressIndex_key" ON "toprecargas_orders"("liquidAddressIndex");
CREATE UNIQUE INDEX "toprecargas_orders_txid_key" ON "toprecargas_orders"("txid");
CREATE INDEX "toprecargas_orders_userId_status_idx" ON "toprecargas_orders"("userId", "status");
CREATE INDEX "toprecargas_orders_status_createdAt_idx" ON "toprecargas_orders"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "toprecargas_orders" ADD CONSTRAINT "toprecargas_orders_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "toprecargas_orders" ADD CONSTRAINT "toprecargas_orders_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "toprecargas_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
