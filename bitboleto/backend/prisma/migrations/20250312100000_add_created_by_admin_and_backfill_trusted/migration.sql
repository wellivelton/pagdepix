-- Add createdByAdmin column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'CommercePartner' AND column_name = 'createdByAdmin'
  ) THEN
    ALTER TABLE "CommercePartner" ADD COLUMN "createdByAdmin" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Backfill: Mark existing admin-created accounts (telegram like @trusted_%) and set them as fully approved
UPDATE "CommercePartner" cp
SET 
  "createdByAdmin" = true,
  "status" = 'APPROVED',
  "initialDepositStatus" = 'confirmed'
FROM "User" u
WHERE cp."userId" = u.id
  AND u.telegram LIKE '@trusted_%'
  AND (cp."createdByAdmin" = false OR cp."status" != 'APPROVED');

-- Ensure User verification fields are set for trusted merchants (first login = fully verified)
UPDATE "User" u
SET 
  "emailVerified" = true,
  "telegramVerified" = true,
  "nameVerified" = true,
  "isBlocked" = false
FROM "CommercePartner" cp
WHERE u.id = cp."userId"
  AND cp."createdByAdmin" = true
  AND (u."emailVerified" = false OR u."telegramVerified" = false OR u."nameVerified" = false OR u."isBlocked" = true);
