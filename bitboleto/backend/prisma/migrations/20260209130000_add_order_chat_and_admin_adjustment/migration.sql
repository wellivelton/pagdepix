-- Add adminAdjustmentRequest to Product (solicitar ajustes do admin)
ALTER TABLE "Product" ADD COLUMN "adminAdjustmentRequest" TEXT;

-- Create OrderChatMessage table (chat por pedido)
CREATE TABLE "OrderChatMessage" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "messageType" VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "attachmentPath" VARCHAR(500),
    "attachmentName" VARCHAR(255),
    "attachmentSize" INTEGER,
    "attachmentMime" VARCHAR(100),
    "isFromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "adminIntervention" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderChatMessage_orderId_idx" ON "OrderChatMessage"("orderId");
CREATE INDEX "OrderChatMessage_senderId_idx" ON "OrderChatMessage"("senderId");
CREATE INDEX "OrderChatMessage_createdAt_idx" ON "OrderChatMessage"("createdAt");

ALTER TABLE "OrderChatMessage" ADD CONSTRAINT "OrderChatMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderChatMessage" ADD CONSTRAINT "OrderChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
