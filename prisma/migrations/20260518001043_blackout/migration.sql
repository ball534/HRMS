-- Blackout windows — block leave during retail peaks
ALTER TYPE "AuditAction" ADD VALUE 'BLACKOUT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'BLACKOUT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'BLACKOUT_DELETED';
ALTER TYPE "AuditEntityType" ADD VALUE 'BLACKOUT';

CREATE TABLE "BlackoutWindow" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "reason"     TEXT,
  "country"    "Country",
  "startDate"  DATE NOT NULL,
  "endDate"    DATE NOT NULL,
  "hardBlock"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlackoutWindow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BlackoutWindow_country_startDate_endDate_idx"
  ON "BlackoutWindow" ("country", "startDate", "endDate");
