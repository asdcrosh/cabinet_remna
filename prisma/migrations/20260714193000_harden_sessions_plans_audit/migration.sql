ALTER TABLE "Plan"
ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "featuredSlot" INTEGER;

CREATE UNIQUE INDEX "Plan_featuredSlot_key" ON "Plan"("featuredSlot");

ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_featured_slot_check"
CHECK (
  ("isFeatured" = true AND "featuredSlot" = 1) OR
  ("isFeatured" = false AND "featuredSlot" IS NULL)
);

ALTER TABLE "User"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

UPDATE "Plan"
SET "isPromo" = true
WHERE "priceKopecks" <= 0 AND "isPromo" = false;

ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_paid_or_promo_check"
CHECK ("priceKopecks" > 0 OR "isPromo" = true);

ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_PLAN_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_PLAN_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_PLAN_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_BONUS_PRIZE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_BONUS_PRIZE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_BONUS_SETTINGS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_BROADCAST_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_BROADCAST_TEMPLATE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_BROADCAST_TEMPLATE_DELETED';
