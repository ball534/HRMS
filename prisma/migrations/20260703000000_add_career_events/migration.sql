-- ============================================================
-- Career journey events — power the "Journey" timeline on an
-- employee's own profile.
-- ============================================================

CREATE TYPE "CareerEventType" AS ENUM (
  'JOINED',
  'POSITION_CHANGE',
  'DEPARTMENT_CHANGE',
  'CONFIRMED',
  'TERMINATED'
);

CREATE TABLE "CareerEvent" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "type"          "CareerEventType" NOT NULL,
  "title"         TEXT NOT NULL,
  "detail"        TEXT,
  "fromValue"     TEXT,
  "toValue"       TEXT,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CareerEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CareerEvent_userId_effectiveDate_idx"
  ON "CareerEvent"("userId", "effectiveDate");

ALTER TABLE "CareerEvent"
  ADD CONSTRAINT "CareerEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: a JOINED event for every existing user so their journey
-- has a starting node (dated from startDate, else account creation).
INSERT INTO "CareerEvent" ("id", "userId", "type", "title", "detail", "toValue", "effectiveDate")
SELECT
  gen_random_uuid()::text,
  u."id",
  'JOINED',
  CASE WHEN u."position" IS NOT NULL AND u."position" <> ''
       THEN 'Joined as ' || u."position"
       ELSE 'Joined the company' END,
  u."department",
  u."position",
  COALESCE(u."startDate", u."createdAt")
FROM "User" u;

-- Backfill: a CONFIRMED event for anyone already confirmed.
INSERT INTO "CareerEvent" ("id", "userId", "type", "title", "detail", "effectiveDate")
SELECT
  gen_random_uuid()::text,
  u."id",
  'CONFIRMED',
  'Confirmed as a permanent employee',
  'Completed probation',
  u."confirmationDate"
FROM "User" u
WHERE u."confirmationDate" IS NOT NULL;
