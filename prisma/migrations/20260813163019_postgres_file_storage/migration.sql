-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "blobId" TEXT,
ALTER COLUMN "s3Key" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmploymentLetter" ADD COLUMN     "blobId" TEXT;

-- AlterTable
ALTER TABLE "ExpenseReceipt" ADD COLUMN     "blobId" TEXT,
ALTER COLUMN "s3Key" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "attachmentBlobId" TEXT;

-- CreateTable
CREATE TABLE "FileBlob" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "refCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterTemplate" (
    "id" TEXT NOT NULL,
    "type" "LetterType" NOT NULL,
    "blobId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fieldNames" TEXT[],
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileBlob_sha256_key" ON "FileBlob"("sha256");

-- CreateIndex
CREATE INDEX "FileBlob_refCount_idx" ON "FileBlob"("refCount");

-- CreateIndex
CREATE UNIQUE INDEX "LetterTemplate_type_key" ON "LetterTemplate"("type");

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_attachmentBlobId_fkey" FOREIGN KEY ("attachmentBlobId") REFERENCES "FileBlob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReceipt" ADD CONSTRAINT "ExpenseReceipt_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "FileBlob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "FileBlob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentLetter" ADD CONSTRAINT "EmploymentLetter_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "FileBlob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterTemplate" ADD CONSTRAINT "LetterTemplate_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "FileBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterTemplate" ADD CONSTRAINT "LetterTemplate_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
