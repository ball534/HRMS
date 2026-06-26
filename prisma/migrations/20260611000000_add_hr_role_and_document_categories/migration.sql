-- Add HR to Role enum (must run outside a transaction in Postgres)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HR' AFTER 'ADMIN';

-- DOCUMENT_DELETED audit action
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DOCUMENT_DELETED';

-- DocumentCategory enum
DO $$ BEGIN
    CREATE TYPE "DocumentCategory" AS ENUM ('CONTRACTS', 'PAYSLIPS', 'MEDICAL', 'CERTIFICATIONS', 'PERSONAL_DOCS', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add category column with default OTHER (backfills existing rows)
ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER';

-- Add updatedAt column, backfilled from createdAt for existing rows
ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

UPDATE "Document" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

ALTER TABLE "Document"
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- New composite index for category-aware lookups
CREATE INDEX IF NOT EXISTS "Document_scope_employeeId_category_idx"
  ON "Document"("scope", "employeeId", "category");

-- Leave balance: entitlement override + carry-forward expiry
ALTER TABLE "LeaveBalance"
  ADD COLUMN IF NOT EXISTS "entitlementOverride" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "carryForwardExpiresAt" TIMESTAMP(3);
