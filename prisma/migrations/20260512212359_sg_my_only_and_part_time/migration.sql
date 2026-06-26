-- ============================================================
-- Drop unused countries (ID/KR/IN/HK/VN), add MY.
-- Add PART_TIME to EmploymentType.
-- Add hourlyRate and normalDailyHours to User (for part-time payroll).
-- ============================================================
-- NOTE: The Country swap will FAIL if any existing rows still reference
-- ID/KR/IN/HK/VN. For a fresh deployment this is fine. For an existing
-- deployment, reassign those rows to SG or MY before running this migration.

-- ---- Country: drop unused values via rename-and-swap pattern ----
CREATE TYPE "Country_new" AS ENUM ('SG', 'MY');

ALTER TABLE "User"
  ALTER COLUMN "country" DROP DEFAULT,
  ALTER COLUMN "country" TYPE "Country_new" USING ("country"::text::"Country_new"),
  ALTER COLUMN "country" SET DEFAULT 'SG';

ALTER TABLE "PublicHoliday"
  ALTER COLUMN "country" TYPE "Country_new" USING ("country"::text::"Country_new");

DROP TYPE "Country";
ALTER TYPE "Country_new" RENAME TO "Country";

-- ---- EmploymentType: add PART_TIME ----
ALTER TYPE "EmploymentType" ADD VALUE 'PART_TIME';

-- ---- User: part-time payroll fields ----
ALTER TABLE "User"
  ADD COLUMN "hourlyRate" DECIMAL(19,4),
  ADD COLUMN "normalDailyHours" DECIMAL(5,2);

-- ---- User: terminatedAt (schema drift — was missing from init migration) ----
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMP(3);

-- ---- AuditAction: backfill values that drifted out of the init migration ----
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPENSE_DELETED';
