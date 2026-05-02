-- Add origin address columns to CommerceSettings (shipping / physical products)
ALTER TABLE "CommerceSettings" ADD COLUMN IF NOT EXISTS "originCep" VARCHAR(10);
ALTER TABLE "CommerceSettings" ADD COLUMN IF NOT EXISTS "originStreet" VARCHAR(200);
ALTER TABLE "CommerceSettings" ADD COLUMN IF NOT EXISTS "originNumber" VARCHAR(20);
ALTER TABLE "CommerceSettings" ADD COLUMN IF NOT EXISTS "originCity" VARCHAR(100);
ALTER TABLE "CommerceSettings" ADD COLUMN IF NOT EXISTS "originState" VARCHAR(2);
