-- Safe, idempotent data migration: transition existing IN_REVIEW profiles to ACTIVE
UPDATE "profiles"
SET "profile_status" = 'ACTIVE'
WHERE "profile_status" = 'IN_REVIEW';
