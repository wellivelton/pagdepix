-- Exigência SwapVerse: identificação do pagador (nome + CPF/CNPJ) para transações acima de R$ 500.
ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "payerName" TEXT;
ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "payerTaxNumber" TEXT;
