-- Campos para troca de e-mail (uma vez para usuários antigos)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailChangePending" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailChangeCode" VARCHAR(6);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailChangeExpires" TIMESTAMP(3);
