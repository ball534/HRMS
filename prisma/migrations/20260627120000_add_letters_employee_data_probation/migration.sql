-- ============================================================
-- Employment/confirmation letters, employee identity data,
-- probation/confirmation tracking, work-pass extra fields.
-- ============================================================

-- New audit actions + entity type
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYMENT_LETTER_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONFIRMATION_LETTER_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'LETTER_REVIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'LETTER_SIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'LETTER_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'LETTER_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'LETTER_REMINDER_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'CONFIRMATION_DATE_SET';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_FOLDER_ARCHIVED';

ALTER TYPE "AuditEntityType" ADD VALUE 'EMPLOYMENT_LETTER';

-- New UserStatus value (offer rejected -> folder archived)
ALTER TYPE "UserStatus" ADD VALUE 'REJECTED';

-- Letter enums
CREATE TYPE "LetterType" AS ENUM ('EMPLOYMENT', 'CONFIRMATION');
CREATE TYPE "LetterStatus" AS ENUM (
  'PENDING_REVIEW',
  'PENDING_SIGNATURE',
  'SIGNED',
  'SENT',
  'REJECTED',
  'OVERDUE'
);

-- User: identity + probation/confirmation columns
ALTER TABLE "User"
  ADD COLUMN "employeeNumber"   TEXT,
  ADD COLUMN "nric"             TEXT,
  ADD COLUMN "passportNumber"   TEXT,
  ADD COLUMN "passportExpiry"   TIMESTAMP(3),
  ADD COLUMN "company"          TEXT,
  ADD COLUMN "probationMonths"  INTEGER DEFAULT 3,
  ADD COLUMN "probationEndDate" TIMESTAMP(3),
  ADD COLUMN "confirmationDate" TIMESTAMP(3),
  ADD COLUMN "folderArchivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_employeeNumber_key" ON "User"("employeeNumber");

-- WorkPass: extra tracked fields
ALTER TABLE "WorkPass"
  ADD COLUMN "workPermitNumber" TEXT,
  ADD COLUMN "finNumber"        TEXT,
  ADD COLUMN "applicationDate"  TIMESTAMP(3),
  ADD COLUMN "approvalDate"     TIMESTAMP(3);

-- EmploymentLetter
CREATE TABLE "EmploymentLetter" (
  "id"                 TEXT NOT NULL,
  "employeeId"         TEXT NOT NULL,
  "type"               "LetterType" NOT NULL DEFAULT 'EMPLOYMENT',
  "status"             "LetterStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "reviewedById"       TEXT,
  "reviewedAt"         TIMESTAMP(3),
  "approvingOfficerId" TEXT,
  "signatureDataUrl"   TEXT,
  "signedAt"           TIMESTAMP(3),
  "rejectedById"       TEXT,
  "rejectedAt"         TIMESTAMP(3),
  "rejectionReason"    TEXT,
  "driveFileId"        TEXT,
  "driveWebViewLink"   TEXT,
  "dueDate"            TIMESTAMP(3),
  "sentAt"             TIMESTAMP(3),
  "lastReminderAt"     TIMESTAMP(3),
  "overdue"            BOOLEAN NOT NULL DEFAULT false,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmploymentLetter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmploymentLetter_status_type_idx" ON "EmploymentLetter" ("status", "type");
CREATE INDEX "EmploymentLetter_employeeId_idx" ON "EmploymentLetter" ("employeeId");
CREATE INDEX "EmploymentLetter_approvingOfficerId_status_idx" ON "EmploymentLetter" ("approvingOfficerId", "status");

ALTER TABLE "EmploymentLetter"
  ADD CONSTRAINT "EmploymentLetter_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmploymentLetter"
  ADD CONSTRAINT "EmploymentLetter_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmploymentLetter"
  ADD CONSTRAINT "EmploymentLetter_approvingOfficerId_fkey"
  FOREIGN KEY ("approvingOfficerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmploymentLetter"
  ADD CONSTRAINT "EmploymentLetter_rejectedById_fkey"
  FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
