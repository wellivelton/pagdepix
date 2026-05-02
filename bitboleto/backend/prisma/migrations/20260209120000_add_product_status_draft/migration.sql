-- AlterEnum: adiciona DRAFT ao ProductStatus (Rascunho no ciclo do produto)
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
