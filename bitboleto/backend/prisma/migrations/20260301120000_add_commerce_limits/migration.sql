-- Limites do comerciante (modo comércio)
-- dailyLimitCommerce: limite diário; null = usar User.dailyLimit
-- monthlyLimitCommerce: limite mensal; null = ilimitado
ALTER TABLE "CommercePartner" ADD COLUMN IF NOT EXISTS "dailyLimitCommerce" DOUBLE PRECISION;
ALTER TABLE "CommercePartner" ADD COLUMN IF NOT EXISTS "monthlyLimitCommerce" DOUBLE PRECISION;
