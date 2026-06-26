-- Learning (LMS) progress sync tables

CREATE TABLE "LearningLessonProgress" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "lessonId"    TEXT NOT NULL,
  "slidesDone"  BOOLEAN NOT NULL DEFAULT false,
  "pdfDone"     BOOLEAN NOT NULL DEFAULT false,
  "videoDone"   BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningLessonProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningTestProgress" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "testId"      TEXT NOT NULL,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "passed"      BOOLEAN NOT NULL DEFAULT false,
  "bestScore"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "locked"      BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningTestProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningSurvey" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "clarity"     INTEGER NOT NULL,
  "pace"        INTEGER NOT NULL,
  "usefulness"  INTEGER NOT NULL,
  "comment"     TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningSurvey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningLessonProgress_userId_lessonId_key"
  ON "LearningLessonProgress" ("userId", "lessonId");
CREATE INDEX "LearningLessonProgress_userId_idx"
  ON "LearningLessonProgress" ("userId");

CREATE UNIQUE INDEX "LearningTestProgress_userId_testId_key"
  ON "LearningTestProgress" ("userId", "testId");
CREATE INDEX "LearningTestProgress_userId_idx"
  ON "LearningTestProgress" ("userId");

CREATE UNIQUE INDEX "LearningSurvey_userId_key"
  ON "LearningSurvey" ("userId");

ALTER TABLE "LearningLessonProgress"
  ADD CONSTRAINT "LearningLessonProgress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningTestProgress"
  ADD CONSTRAINT "LearningTestProgress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningSurvey"
  ADD CONSTRAINT "LearningSurvey_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
