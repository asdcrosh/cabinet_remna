ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_USERS_MERGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PERSONAL_OFFER_UPDATED';

CREATE TYPE "PersonalOfferScenario" AS ENUM (
  'NO_SUBSCRIPTION',
  'RETURN_PROMO',
  'RENEWAL_SOON',
  'CONNECT_DEVICE',
  'REFERRAL'
);

CREATE TYPE "PersonalOfferTone" AS ENUM (
  'CYAN',
  'EMERALD',
  'AMBER',
  'VIOLET'
);

CREATE TABLE "PersonalOfferSetting" (
  "id" TEXT NOT NULL,
  "scenario" "PersonalOfferScenario" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "eyebrow" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "cta" TEXT NOT NULL,
  "href" TEXT,
  "meta" TEXT,
  "tone" "PersonalOfferTone" NOT NULL DEFAULT 'CYAN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PersonalOfferSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonalOfferSetting_scenario_key" ON "PersonalOfferSetting"("scenario");
CREATE INDEX "PersonalOfferSetting_enabled_priority_idx" ON "PersonalOfferSetting"("enabled", "priority");
