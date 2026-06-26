-- ============================================================
-- Part-time timesheet: TimeEntry + audit enum extensions
-- ============================================================

-- AuditAction additions
ALTER TYPE "AuditAction" ADD VALUE 'TIME_ENTRY_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE 'TIME_ENTRY_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'TIME_ENTRY_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'TIME_ENTRY_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'TIME_ENTRY_UNLOCKED';

-- AuditEntityType addition
ALTER TYPE "AuditEntityType" ADD VALUE 'TIME_ENTRY';

-- TimeEntryStatus enum
CREATE TYPE "TimeEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- TimeEntry table
CREATE TABLE "TimeEntry" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "workDate"        DATE NOT NULL,
  "startTime"       TIMESTAMP(3),
  "endTime"         TIMESTAMP(3),
  "breakMinutes"    INTEGER NOT NULL DEFAULT 0,
  "hoursWorked"     DECIMAL(5,2) NOT NULL,
  "description"     TEXT,
  "isPublicHoliday" BOOLEAN NOT NULL DEFAULT false,
  "status"          "TimeEntryStatus" NOT NULL DEFAULT 'DRAFT',
  "approverId"      TEXT,
  "submittedAt"     TIMESTAMP(3),
  "approvedAt"      TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TimeEntry_userId_workDate_key" ON "TimeEntry" ("userId", "workDate");
CREATE INDEX "TimeEntry_userId_status_idx" ON "TimeEntry" ("userId", "status");
CREATE INDEX "TimeEntry_approverId_status_idx" ON "TimeEntry" ("approverId", "status");
CREATE INDEX "TimeEntry_workDate_idx" ON "TimeEntry" ("workDate");

ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
