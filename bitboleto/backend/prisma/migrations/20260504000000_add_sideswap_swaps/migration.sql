CREATE TABLE IF NOT EXISTS "sideswap_swaps" (
  "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"           TEXT        NOT NULL,
  "status"           VARCHAR(30) NOT NULL DEFAULT 'pending_deposit',
  "depositAsset"     VARCHAR(100) NOT NULL,
  "settleAsset"      VARCHAR(100) NOT NULL,
  "depositAmount"    NUMERIC(20,8),
  "settleAmount"     NUMERIC(20,8),
  "settleAddress"    TEXT        NOT NULL,
  "depositAddress"   TEXT,
  "depositTxid"      TEXT,
  "settleTxid"       TEXT,
  "sideswapOrderId"  TEXT,
  "errorMessage"     TEXT,
  "rawQuote"         JSONB,
  "rawPset"          TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "sideswap_swaps_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "sideswap_swaps_userId_fkey"    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "sideswap_swaps_userId_idx"    ON "sideswap_swaps"("userId");
CREATE INDEX IF NOT EXISTS "sideswap_swaps_status_idx"    ON "sideswap_swaps"("status");
CREATE INDEX IF NOT EXISTS "sideswap_swaps_createdAt_idx" ON "sideswap_swaps"("createdAt" DESC);
