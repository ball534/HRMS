-- ============================================================
-- Rewards / bonus allocation
-- ============================================================

-- AuditAction additions
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_CYCLE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_CYCLE_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_CYCLE_PAID';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_CYCLE_CLOSED';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_ALLOCATION_SAVED';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_ALLOCATION_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_ALLOCATION_PAID';
ALTER TYPE "AuditAction" ADD VALUE 'REWARD_ALLOCATION_CANCELLED';

-- AuditEntityType additions
ALTER TYPE "AuditEntityType" ADD VALUE 'REWARD_CYCLE';
ALTER TYPE "AuditEntityType" ADD VALUE 'REWARD_ALLOCATION';

-- Enums
CREATE TYPE "RewardCycleStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CLOSED');
CREATE TYPE "RewardAllocationStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');
CREATE TYPE "BonusType" AS ENUM ('PERFORMANCE', 'CONTRACTUAL_13TH', 'AD_HOC');

-- RewardCycle
CREATE TABLE "RewardCycle" (
  "id"               TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "description"      TEXT,
  "status"           "RewardCycleStatus" NOT NULL DEFAULT 'DRAFT',
  "reviewCycleId"    TEXT,
  "totalPoolAmount"  DECIMAL(19,4),
  "currency"         TEXT NOT NULL DEFAULT 'MYR',
  "payoutDate"       TIMESTAMP(3),
  "createdById"      TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardCycle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RewardCycle_status_payoutDate_idx" ON "RewardCycle" ("status", "payoutDate");

ALTER TABLE "RewardCycle"
  ADD CONSTRAINT "RewardCycle_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RewardCycle"
  ADD CONSTRAINT "RewardCycle_reviewCycleId_fkey"
  FOREIGN KEY ("reviewCycleId") REFERENCES "ReviewCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RewardAllocation
CREATE TABLE "RewardAllocation" (
  "id"             TEXT NOT NULL,
  "cycleId"        TEXT NOT NULL,
  "employeeId"     TEXT NOT NULL,
  "linkedReviewId" TEXT,
  "bonusType"      "BonusType" NOT NULL DEFAULT 'PERFORMANCE',
  "amount"         DECIMAL(19,4) NOT NULL,
  "currency"       TEXT NOT NULL,
  "rationale"      TEXT,
  "status"         "RewardAllocationStatus" NOT NULL DEFAULT 'DRAFT',
  "proposedById"   TEXT,
  "approverId"     TEXT,
  "approvedAt"     TIMESTAMP(3),
  "paidAt"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RewardAllocation_cycleId_employeeId_bonusType_key"
  ON "RewardAllocation" ("cycleId", "employeeId", "bonusType");
CREATE INDEX "RewardAllocation_cycleId_status_idx"
  ON "RewardAllocation" ("cycleId", "status");
CREATE INDEX "RewardAllocation_employeeId_idx"
  ON "RewardAllocation" ("employeeId");

ALTER TABLE "RewardAllocation"
  ADD CONSTRAINT "RewardAllocation_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "RewardCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RewardAllocation"
  ADD CONSTRAINT "RewardAllocation_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardAllocation"
  ADD CONSTRAINT "RewardAllocation_linkedReviewId_fkey"
  FOREIGN KEY ("linkedReviewId") REFERENCES "PerformanceReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RewardAllocation"
  ADD CONSTRAINT "RewardAllocation_proposedById_fkey"
  FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RewardAllocation"
  ADD CONSTRAINT "RewardAllocation_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
