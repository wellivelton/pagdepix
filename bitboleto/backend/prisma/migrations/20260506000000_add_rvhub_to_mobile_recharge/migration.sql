-- MobileRecharge: campos RV Hub para recarga de celular
ALTER TABLE "MobileRecharge"
  ADD COLUMN IF NOT EXISTS "rvhubRechargeId"   TEXT,
  ADD COLUMN IF NOT EXISTS "rvhubStatus"       TEXT,
  ADD COLUMN IF NOT EXISTS "rvhubProductId"    TEXT,
  ADD COLUMN IF NOT EXISTS "authorizationCode" TEXT,
  ADD COLUMN IF NOT EXISTS "nsu"               TEXT;
