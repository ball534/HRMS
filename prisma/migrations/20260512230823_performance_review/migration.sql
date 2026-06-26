-- ============================================================
-- Performance review feature: ReviewCycle, PerformanceReview, Goal
-- + extends AuditAction and AuditEntityType enums.
-- ============================================================

-- ---- AuditAction: add review-related actions ----
ALTER TYPE "AuditAction" ADD VALUE 'REVIEW_CYCLE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'REVIEW_CYCLE_OPENED';
ALTER TYPE "AuditAction" ADD VALUE 'REVIEW_CYCLE_EVALUATION_OPENED';
ALTER TYPE "AuditAction" ADD VALUE 'REVIEW_CYCLE_CLOSED';
ALTER TYPE "AuditAction" ADD VALUE 'REVIEW_GOALS_SET';
ALTER TYPE "AuditAction" ADD VALUE 'REVIEW_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE 'REVIEW_ACKNOWLEDGED';
ALTER TYPE "AuditAction" ADD VALUE 'REVIEW_REOPENED';
ALTER TYPE "AuditAction" ADD VALUE 'PROBATION_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'PROBATION_EXTENDED';
ALTER TYPE "AuditAction" ADD VALUE 'PROBATION_NOT_CONFIRMED';

-- ---- AuditEntityType: add new entity types ----
ALTER TYPE "AuditEntityType" ADD VALUE 'REVIEW_CYCLE';
ALTER TYPE "AuditEntityType" ADD VALUE 'PERFORMANCE_REVIEW';

-- ---- New enums ----
CREATE TYPE "ReviewTemplateType" AS ENUM ('FULL', 'LITE', 'PROBATION');
CREATE TYPE "ReviewCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EVALUATION', 'CLOSED');
CREATE TYPE "PerformanceReviewStatus" AS ENUM ('NOT_STARTED', 'GOALS_SET', 'IN_EVALUATION', 'PENDING_ACKNOWLEDGEMENT', 'ACKNOWLEDGED');
CREATE TYPE "GoalType" AS ENUM ('QUALITATIVE', 'QUANTITATIVE');
CREATE TYPE "GoalOutcome" AS ENUM ('NOT_EVALUATED', 'MISSED', 'PARTIAL', 'MET', 'EXCEEDED');
CREATE TYPE "ProbationDecision" AS ENUM ('CONFIRMED', 'EXTENDED', 'NOT_CONFIRMED');

-- ---- ReviewCycle ----
CREATE TABLE "ReviewCycle" (
  "id"                       TEXT NOT NULL,
  "name"                     TEXT NOT NULL,
  "templateType"             "ReviewTemplateType" NOT NULL DEFAULT 'FULL',
  "status"                   "ReviewCycleStatus" NOT NULL DEFAULT 'DRAFT',
  "startDate"                TIMESTAMP(3) NOT NULL,
  "endDate"                  TIMESTAMP(3) NOT NULL,
  "goalSettingDeadline"      TIMESTAMP(3),
  "evaluationOpensAt"        TIMESTAMP(3),
  "evaluationDeadline"       TIMESTAMP(3),
  "ratingScale"              INTEGER NOT NULL DEFAULT 5,
  "ratingLabels"             JSONB NOT NULL DEFAULT '["Below","Approaching","Meets","Exceeds","Outstanding"]',
  "minGoals"                 INTEGER NOT NULL DEFAULT 3,
  "maxGoals"                 INTEGER NOT NULL DEFAULT 7,
  "goalWeightsEnabled"       BOOLEAN NOT NULL DEFAULT false,
  "employeeSelfAssessment"   BOOLEAN NOT NULL DEFAULT false,
  "employeeCanComment"       BOOLEAN NOT NULL DEFAULT true,
  "requireManagerNarrative"  BOOLEAN NOT NULL DEFAULT true,
  "includeSalesTarget"       BOOLEAN NOT NULL DEFAULT false,
  "targetCurrency"           TEXT,
  "includeAttendanceMetric"  BOOLEAN NOT NULL DEFAULT false,
  "createdById"              TEXT NOT NULL,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewCycle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewCycle_status_endDate_idx" ON "ReviewCycle" ("status", "endDate");
CREATE INDEX "ReviewCycle_templateType_status_idx" ON "ReviewCycle" ("templateType", "status");

ALTER TABLE "ReviewCycle"
  ADD CONSTRAINT "ReviewCycle_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- PerformanceReview ----
CREATE TABLE "PerformanceReview" (
  "id"                         TEXT NOT NULL,
  "cycleId"                    TEXT NOT NULL,
  "employeeId"                 TEXT NOT NULL,
  "managerId"                  TEXT NOT NULL,
  "status"                     "PerformanceReviewStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "overallRating"              INTEGER,
  "managerNarrative"           TEXT,
  "employeeAcknowledgement"    TEXT,
  "employeeSelfAssessment"     TEXT,
  "salesTargetAmount"          DECIMAL(19,4),
  "salesActualAmount"          DECIMAL(19,4),
  "attendanceDaysWorked"       INTEGER,
  "attendanceDaysScheduled"    INTEGER,
  "promotionReady"             BOOLEAN,
  "probationDecision"          "ProbationDecision",
  "submittedForEvaluationAt"   TIMESTAMP(3),
  "acknowledgedAt"             TIMESTAMP(3),
  "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PerformanceReview_cycleId_employeeId_key"
  ON "PerformanceReview" ("cycleId", "employeeId");
CREATE INDEX "PerformanceReview_managerId_status_idx"
  ON "PerformanceReview" ("managerId", "status");
CREATE INDEX "PerformanceReview_employeeId_cycleId_idx"
  ON "PerformanceReview" ("employeeId", "cycleId");

ALTER TABLE "PerformanceReview"
  ADD CONSTRAINT "PerformanceReview_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PerformanceReview"
  ADD CONSTRAINT "PerformanceReview_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PerformanceReview"
  ADD CONSTRAINT "PerformanceReview_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- Goal ----
CREATE TABLE "Goal" (
  "id"             TEXT NOT NULL,
  "reviewId"       TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "goalType"       "GoalType" NOT NULL DEFAULT 'QUALITATIVE',
  "targetValue"    DECIMAL(19,4),
  "actualValue"    DECIMAL(19,4),
  "unit"           TEXT,
  "weight"         INTEGER,
  "outcome"        "GoalOutcome" NOT NULL DEFAULT 'NOT_EVALUATED',
  "managerComment" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Goal_reviewId_idx" ON "Goal" ("reviewId");

ALTER TABLE "Goal"
  ADD CONSTRAINT "Goal_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
