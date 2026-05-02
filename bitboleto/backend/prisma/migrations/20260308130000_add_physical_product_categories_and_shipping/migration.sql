-- AlterEnum
-- Novas categorias para produtos físicos
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'ELECTRONICS';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'CLOTHING';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'BOOKS';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'HOME';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'SPORTS';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'BEAUTY';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'TOYS';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'OTHER';

-- Novo tipo de entrega para produtos físicos (envio pelos Correios)
ALTER TYPE "DeliveryType" ADD VALUE IF NOT EXISTS 'SHIPPING';
