-- Remove the expenses module.
--
-- The module had been switched off in the UI since 2026-06 (a `HIDDEN` flag in
-- each page returned 404) while the tables, actions and components stayed in
-- the tree. It is now gone outright.
--
-- Kept deliberately: the `EXPENSE_*` values in "AuditAction" and
-- "NotificationType", and `EXPENSE` in "AuditEntityType". Rows written while
-- the module existed still reference them, and dropping an enum value that
-- existing rows use is not possible anyway. Nothing writes them any more.

-- Receipt files were the only expense-owned blobs. Note which they are before
-- the referencing rows go, then give up those references and bin the bytes that
-- nothing else points at — otherwise the blobs survive with a refCount no
-- surviving record justifies.
CREATE TEMP TABLE "_dropped_receipt_blobs" AS
  SELECT DISTINCT "blobId" FROM "ExpenseReceipt" WHERE "blobId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_approverId_fkey";

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_reimbursedById_fkey";

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_userId_fkey";

-- DropForeignKey
ALTER TABLE "ExpenseApproval" DROP CONSTRAINT "ExpenseApproval_approverId_fkey";

-- DropForeignKey
ALTER TABLE "ExpenseApproval" DROP CONSTRAINT "ExpenseApproval_expenseId_fkey";

-- DropForeignKey
ALTER TABLE "ExpenseReceipt" DROP CONSTRAINT "ExpenseReceipt_blobId_fkey";

-- DropForeignKey
ALTER TABLE "ExpenseReceipt" DROP CONSTRAINT "ExpenseReceipt_expenseId_fkey";

-- DropForeignKey
ALTER TABLE "ExpenseReceipt" DROP CONSTRAINT "ExpenseReceipt_uploadedById_fkey";

-- DropTable
DROP TABLE "Expense";

-- DropTable
DROP TABLE "ExpenseApproval";

-- DropTable
DROP TABLE "ExpenseReceipt";

UPDATE "FileBlob" b
   SET "refCount" = GREATEST(b."refCount" - 1, 0)
  FROM "_dropped_receipt_blobs" t
 WHERE b."id" = t."blobId";

DELETE FROM "FileBlob"
 WHERE "refCount" <= 0
   AND "id" IN (SELECT "blobId" FROM "_dropped_receipt_blobs");

DROP TABLE "_dropped_receipt_blobs";

-- DropEnum
DROP TYPE "ExpenseCategory";

-- DropEnum
DROP TYPE "ExpenseStatus";
