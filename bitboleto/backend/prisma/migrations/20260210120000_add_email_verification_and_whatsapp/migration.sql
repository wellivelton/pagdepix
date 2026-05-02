-- Add whatsapp to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;

-- Create EmailVerificationRequest table
CREATE TABLE IF NOT EXISTS "EmailVerificationRequest" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationRequest_email_key" ON "EmailVerificationRequest"("email");
CREATE INDEX "EmailVerificationRequest_expiresAt_idx" ON "EmailVerificationRequest"("expiresAt");
