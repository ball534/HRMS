-- CreateEnum
CREATE TYPE "Citizenship" AS ENUM ('SG_CITIZEN', 'SG_PR', 'FOREIGNER');

-- CreateEnum
CREATE TYPE "LetterKind" AS ENUM ('FT_RETAIL', 'FT_HQ', 'PT_LOGISTICS', 'PT_RETAIL', 'INTERN_REGULAR', 'INTERN_SCHOOL');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'FOR_INTERVIEW', 'PASSED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'LETTER_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE 'LETTER_DECLINED';
ALTER TYPE "AuditAction" ADD VALUE 'CANDIDATE_APPLIED';
ALTER TYPE "AuditAction" ADD VALUE 'CANDIDATE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CANDIDATE_SENT_TO_INTERVIEW';
ALTER TYPE "AuditAction" ADD VALUE 'CANDIDATE_PASSED';
ALTER TYPE "AuditAction" ADD VALUE 'CANDIDATE_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'ONBOARDING_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE 'WORK_PASS_DOC_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'WORK_PASS_DOC_DELETED';

-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE 'CANDIDATE';
ALTER TYPE "AuditEntityType" ADD VALUE 'ONBOARDING';

-- AlterEnum
ALTER TYPE "LetterStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "LetterStatus" ADD VALUE 'DECLINED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LETTER_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'LETTER_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'CANDIDATE_APPLIED';
ALTER TYPE "NotificationType" ADD VALUE 'ONBOARDING_DOCS_DUE';

-- AlterEnum
--
-- ADMIN and CONTRACTOR are gone. ADMIN existed above HR, which in practice
-- meant the HR team shared the admin login; HR is now the full-access account,
-- so those users become HR. CONTRACTOR described an employment arrangement
-- rather than a level of access — that lives in "EmploymentType", which is
-- untouched here — so those users become EMPLOYEE.
--
-- The default cast Prisma generates ("role"::text::"Role_new") would fail on
-- exactly the rows this remap exists for, hence the CASE.
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('HR', 'MANAGER', 'EMPLOYEE', 'PARTTIME');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'HR'
    WHEN 'CONTRACTOR' THEN 'EMPLOYEE'
    ELSE "role"::text
  END::"Role_new"
);
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';
COMMIT;

-- Part-timers are identified by their role from here on, so bring the two
-- fields into agreement before anything starts reading only one of them.
UPDATE "User" SET "role" = 'PARTTIME'
WHERE "employmentType" = 'PART_TIME' AND "role" IN ('EMPLOYEE');

-- Letter templates are gone: a letter body is now editable sections on the
-- letter itself, not a fillable PDF uploaded per letter type.
--
-- The blob references the templates held have to be given up, and the bytes
-- binned when nothing else points at them — dropping the table alone would
-- leave blobs behind whose refCount no surviving record justifies. The blob
-- ids are noted first because the cleanup can only run once the referencing
-- rows are gone.
CREATE TEMP TABLE "_dropped_template_blobs" AS
  SELECT DISTINCT "blobId" FROM "LetterTemplate";

-- DropForeignKey
ALTER TABLE "LetterTemplate" DROP CONSTRAINT "LetterTemplate_blobId_fkey";

-- DropForeignKey
ALTER TABLE "LetterTemplate" DROP CONSTRAINT "LetterTemplate_uploadedById_fkey";

-- DropTable
DROP TABLE "LetterTemplate";

UPDATE "FileBlob" b
   SET "refCount" = GREATEST(b."refCount" - 1, 0)
  FROM "_dropped_template_blobs" t
 WHERE b."id" = t."blobId";

DELETE FROM "FileBlob"
 WHERE "refCount" <= 0
   AND "id" IN (SELECT "blobId" FROM "_dropped_template_blobs");

DROP TABLE "_dropped_template_blobs";

-- AlterTable
ALTER TABLE "EmploymentLetter" ADD COLUMN     "employeeAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "employeeDeclineReason" TEXT,
ADD COLUMN     "employeeDeclinedAt" TIMESTAMP(3),
ADD COLUMN     "employeeSignatureDataUrl" TEXT,
ADD COLUMN     "kind" "LetterKind",
ADD COLUMN     "sections" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "citizenship" "Citizenship",
ADD COLUMN     "hourlyRateSaturday" DECIMAL(19,4),
ADD COLUMN     "hourlyRateSundayPh" DECIMAL(19,4),
ADD COLUMN     "hourlyRateWeekday" DECIMAL(19,4),
ADD COLUMN     "hourlyRateWeekend" DECIMAL(19,4);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "citizenship" "Citizenship" NOT NULL,
    "positionApplied" TEXT,
    "department" TEXT,
    "employmentTypeWanted" "EmploymentType",
    "earliestStartDate" TIMESTAMP(3),
    "resumeBlobId" TEXT,
    "resumeFileName" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "decidedById" TEXT,
    "sentToInterviewAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "hiredUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "prGrantDate" TIMESTAMP(3),
    "nricFrontDocId" TEXT,
    "nricBackDocId" TEXT,
    "bankProofDocId" TEXT,
    "entryPermitDocId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPassDocument" (
    "id" TEXT NOT NULL,
    "workPassId" TEXT NOT NULL,
    "blobId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "label" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkPassDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_hiredUserId_key" ON "Candidate"("hiredUserId");

-- CreateIndex
CREATE INDEX "Candidate_status_createdAt_idx" ON "Candidate"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Candidate_email_idx" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Candidate_resumeBlobId_idx" ON "Candidate"("resumeBlobId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSubmission_userId_key" ON "OnboardingSubmission"("userId");

-- CreateIndex
CREATE INDEX "OnboardingSubmission_submittedAt_idx" ON "OnboardingSubmission"("submittedAt");

-- CreateIndex
CREATE INDEX "WorkPassDocument_workPassId_idx" ON "WorkPassDocument"("workPassId");

-- CreateIndex
CREATE INDEX "WorkPassDocument_blobId_idx" ON "WorkPassDocument"("blobId");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_resumeBlobId_fkey" FOREIGN KEY ("resumeBlobId") REFERENCES "FileBlob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_hiredUserId_fkey" FOREIGN KEY ("hiredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSubmission" ADD CONSTRAINT "OnboardingSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSubmission" ADD CONSTRAINT "OnboardingSubmission_nricFrontDocId_fkey" FOREIGN KEY ("nricFrontDocId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSubmission" ADD CONSTRAINT "OnboardingSubmission_nricBackDocId_fkey" FOREIGN KEY ("nricBackDocId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSubmission" ADD CONSTRAINT "OnboardingSubmission_bankProofDocId_fkey" FOREIGN KEY ("bankProofDocId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSubmission" ADD CONSTRAINT "OnboardingSubmission_entryPermitDocId_fkey" FOREIGN KEY ("entryPermitDocId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPassDocument" ADD CONSTRAINT "WorkPassDocument_workPassId_fkey" FOREIGN KEY ("workPassId") REFERENCES "WorkPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPassDocument" ADD CONSTRAINT "WorkPassDocument_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "FileBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPassDocument" ADD CONSTRAINT "WorkPassDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
