-- ============================================================
-- Work passes (SG / MY foreign-worker permit tracking)
-- ============================================================

ALTER TYPE "AuditAction" ADD VALUE 'WORK_PASS_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'WORK_PASS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'WORK_PASS_DELETED';

ALTER TYPE "AuditEntityType" ADD VALUE 'WORK_PASS';

CREATE TYPE "WorkPassType" AS ENUM (
  'NONE',
  'SG_WORK_PERMIT',
  'SG_S_PASS',
  'SG_EMPLOYMENT_PASS',
  'SG_DEPENDANT_PASS',
  'SG_LTVP_PLUS',
  'MY_WORK_PERMIT',
  'MY_EMPLOYMENT_PASS',
  'MY_DEPENDANT_PASS',
  'OTHER'
);

CREATE TABLE "WorkPass" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "passType"    "WorkPassType" NOT NULL,
  "passNumber"  TEXT,
  "issueDate"   TIMESTAMP(3),
  "expiryDate"  TIMESTAMP(3),
  "levy"        DECIMAL(19,4),
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkPass_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkPass_userId_idx" ON "WorkPass" ("userId");
CREATE INDEX "WorkPass_expiryDate_idx" ON "WorkPass" ("expiryDate");

ALTER TABLE "WorkPass"
  ADD CONSTRAINT "WorkPass_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
