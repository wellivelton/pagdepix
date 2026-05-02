-- Script SQL para executar manualmente caso a migration tenha falhado
-- Execute este script diretamente no PostgreSQL

-- 1. Criar tabela CommercePage (se não existir)
CREATE TABLE IF NOT EXISTS "CommercePage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommercePage_pkey" PRIMARY KEY ("id")
);

-- 2. Criar índices (se não existirem)
CREATE UNIQUE INDEX IF NOT EXISTS "CommercePage_slug_key" ON "CommercePage"("slug");
CREATE INDEX IF NOT EXISTS "CommercePage_userId_idx" ON "CommercePage"("userId");
CREATE INDEX IF NOT EXISTS "CommercePage_slug_idx" ON "CommercePage"("slug");

-- 3. Adicionar constraint de foreign key (verificar se não existe antes)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CommercePage_userId_fkey'
    ) THEN
        ALTER TABLE "CommercePage" 
        ADD CONSTRAINT "CommercePage_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 4. Adicionar coluna commercePageId em DepixOrder (se não existir)
ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "commercePageId" TEXT;

-- 5. Criar índice para commercePageId (se não existir)
CREATE INDEX IF NOT EXISTS "DepixOrder_commercePageId_idx" ON "DepixOrder"("commercePageId");

-- 6. Adicionar constraint de foreign key para DepixOrder (verificar se não existe antes)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DepixOrder_commercePageId_fkey'
    ) THEN
        ALTER TABLE "DepixOrder" 
        ADD CONSTRAINT "DepixOrder_commercePageId_fkey" 
        FOREIGN KEY ("commercePageId") REFERENCES "CommercePage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
