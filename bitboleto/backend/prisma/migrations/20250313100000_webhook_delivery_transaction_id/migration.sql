-- Add transactionId to webhook_deliveries for deduplication and audit
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "transactionId" TEXT;

-- Index for duplicate check (endpointId + event + transactionId)
CREATE INDEX IF NOT EXISTS "webhook_deliveries_endpoint_event_tx_idx" 
  ON "webhook_deliveries"("endpointId", "event", "transactionId");
