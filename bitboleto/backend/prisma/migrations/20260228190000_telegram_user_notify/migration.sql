-- User: chat_id do Telegram para notificações (salvo ao verificar no bot)
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;

-- DepixOrder: controle para não notificar duas vezes
ALTER TABLE "DepixOrder" ADD COLUMN "telegramNotifiedAt" TIMESTAMP(3);
