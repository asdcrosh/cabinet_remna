CREATE TABLE "FeatureSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "referrals" BOOLEAN NOT NULL DEFAULT true,
    "bonusBox" BOOLEAN NOT NULL DEFAULT true,
    "support" BOOLEAN NOT NULL DEFAULT true,
    "broadcasts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureSetting_pkey" PRIMARY KEY ("id")
);

ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_FEATURES_UPDATED';
