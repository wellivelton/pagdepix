-- CreateEnum (idempotente: evita erro se já existir)
DO $$ BEGIN
  CREATE TYPE "PlatformNotificationType" AS ENUM ('POPUP', 'BANNER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "PlatformNotificationTarget" AS ENUM ('ALL', 'ROLES', 'USERS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable (IF NOT EXISTS para idempotência)
CREATE TABLE IF NOT EXISTS "platform_notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "buttonText" TEXT,
    "buttonUrl" TEXT,
    "type" "PlatformNotificationType" NOT NULL DEFAULT 'POPUP',
    "targetType" "PlatformNotificationTarget" NOT NULL DEFAULT 'ALL',
    "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "platform_notification_views" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clickedAt" TIMESTAMP(3),

    CONSTRAINT "platform_notification_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "platform_notifications_isActive_startsAt_expiresAt_idx" ON "platform_notifications"("isActive", "startsAt", "expiresAt");
CREATE INDEX IF NOT EXISTS "platform_notifications_targetType_idx" ON "platform_notifications"("targetType");
CREATE UNIQUE INDEX IF NOT EXISTS "platform_notification_views_notificationId_userId_key" ON "platform_notification_views"("notificationId", "userId");
CREATE INDEX IF NOT EXISTS "platform_notification_views_userId_idx" ON "platform_notification_views"("userId");
CREATE INDEX IF NOT EXISTS "platform_notification_views_notificationId_idx" ON "platform_notification_views"("notificationId");

-- AddForeignKey (ignora se já existir)
DO $$ BEGIN
  ALTER TABLE "platform_notification_views" ADD CONSTRAINT "platform_notification_views_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "platform_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "platform_notification_views" ADD CONSTRAINT "platform_notification_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
