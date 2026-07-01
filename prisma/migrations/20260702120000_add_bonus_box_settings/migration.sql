CREATE TABLE "BonusBoxSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "pityEnabled" BOOLEAN NOT NULL DEFAULT true,
  "pityOpenings" INTEGER NOT NULL DEFAULT 10,
  "showBestRecentOpening" BOOLEAN NOT NULL DEFAULT true,
  "activePromoRewardsLimit" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BonusBoxSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BonusBoxSetting" (
  "id",
  "pityEnabled",
  "pityOpenings",
  "showBestRecentOpening",
  "activePromoRewardsLimit",
  "updatedAt"
) VALUES (
  'default',
  true,
  10,
  true,
  3,
  CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;
