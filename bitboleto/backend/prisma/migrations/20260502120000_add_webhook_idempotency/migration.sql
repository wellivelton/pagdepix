-- Migration: add_webhook_idempotency
-- Creates the webhook_idempotency_keys table used to deduplicate inbound webhook
-- events from Telegram, GeraDePix, and Velora on gateway retries.
-- The unique key is (source, eventType, externalId) — intentionally allows
-- the same externalId with different eventTypes (e.g. payment.paid + payment.refunded).

CREATE TABLE "webhook_idempotency_keys" (
  "id"           TEXT         NOT NULL,
  "source"       TEXT         NOT NULL,
  "eventType"    TEXT         NOT NULL,
  "externalId"   TEXT         NOT NULL,
  "payloadHash"  TEXT         NOT NULL,
  "processedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "result"       TEXT         NOT NULL,
  "errorMessage" TEXT,

  CONSTRAINT "webhook_idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_idempotency_keys_source_eventType_externalId_key"
  ON "webhook_idempotency_keys"("source", "eventType", "externalId");

CREATE INDEX "webhook_idempotency_keys_processedAt_idx"
  ON "webhook_idempotency_keys"("processedAt");
