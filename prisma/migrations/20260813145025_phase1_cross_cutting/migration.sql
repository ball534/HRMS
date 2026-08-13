-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LEAVE_SUBMITTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'LEAVE_CANCELLED', 'TIMESHEET_SUBMITTED', 'TIMESHEET_APPROVED', 'TIMESHEET_REJECTED', 'EXPENSE_SUBMITTED', 'EXPENSE_APPROVED', 'EXPENSE_REJECTED', 'EXPENSE_REIMBURSED', 'PERFORMANCE_GOALS_SET', 'PERFORMANCE_REVIEW_SUBMITTED', 'PERFORMANCE_ACK_REQUIRED', 'PERFORMANCE_DEADLINE', 'REWARD_APPROVED', 'REWARD_PAID', 'LEARNING_LOCKED_OUT', 'LEARNING_UNLOCKED', 'LEARNING_DUE', 'WORK_PASS_EXPIRING', 'WORK_PASS_EXPIRED', 'LETTER_READY_FOR_ACTION', 'LETTER_SENT', 'PROBATION_DUE', 'APPROVAL_REASSIGNED', 'STATE_REVERSED', 'GENERAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'USER_OFFBOARDED';
ALTER TYPE "AuditAction" ADD VALUE 'APPROVALS_REASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'DIRECT_REPORTS_REASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'SESSION_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE 'SETTING_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'STATUTORY_RULES_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'STATUTORY_RULES_VERIFIED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_REVERSED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_REVERSED';
ALTER TYPE "AuditAction" ADD VALUE 'TIME_ENTRY_REVERSED';
ALTER TYPE "AuditAction" ADD VALUE 'REVIEW_CYCLE_REVERSED';
ALTER TYPE "AuditAction" ADD VALUE 'PERFORMANCE_REVIEW_REVERSED';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_CYCLE_REVERSED';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_ALLOCATION_REVERSED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYMENT_LETTER_REVERSED';
ALTER TYPE "AuditAction" ADD VALUE 'LEARNING_LOCKOUT_REVERSED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYROLL_EXPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_EXPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'RATINGS_EXPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_VIEWED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEntityType" ADD VALUE 'LEARNING';
ALTER TYPE "AuditEntityType" ADD VALUE 'PAYROLL';
ALTER TYPE "AuditEntityType" ADD VALUE 'SETTING';
ALTER TYPE "AuditEntityType" ADD VALUE 'STATUTORY_RULES';

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "StatutoryRuleSet" (
    "id" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "rules" JSONB NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatutoryRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StatutoryRuleSet_country_effectiveFrom_idx" ON "StatutoryRuleSet"("country", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryRuleSet_country_effectiveFrom_key" ON "StatutoryRuleSet"("country", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
