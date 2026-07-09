-- CreateTable
CREATE TABLE "LearningModuleLesson" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningModuleLesson_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LearningModuleLesson" ADD CONSTRAINT "LearningModuleLesson_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
