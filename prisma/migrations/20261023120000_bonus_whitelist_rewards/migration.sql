ALTER TYPE "BonusBoxPrizeType" ADD VALUE 'WHITELIST_DAYS';

ALTER TABLE "BonusBoxPrize" ADD COLUMN "internalSquads" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Subscription"
  ADD COLUMN "whitelistAddonRewardSeconds" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "whitelistAddonRewardSquads" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
