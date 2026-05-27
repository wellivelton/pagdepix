-- CreateTable
CREATE TABLE "rvhub_sync_logs" (
    "id"          TEXT NOT NULL,
    "kindsFound"  TEXT NOT NULL,
    "added"       INTEGER NOT NULL DEFAULT 0,
    "updated"     INTEGER NOT NULL DEFAULT 0,
    "deactivated" INTEGER NOT NULL DEFAULT 0,
    "errors"      TEXT,
    "durationMs"  INTEGER,
    "success"     BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rvhub_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rvhub_sync_logs_createdAt_idx" ON "rvhub_sync_logs"("createdAt" DESC);
