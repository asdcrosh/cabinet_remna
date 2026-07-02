ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SEASONAL_EVENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AUTOFUNNEL';
ALTER TYPE "BonusBoxAttemptSource" ADD VALUE IF NOT EXISTS 'BUNDLE';
ALTER TYPE "BonusBoxAttemptSource" ADD VALUE IF NOT EXISTS 'SEASONAL_EVENT';
ALTER TYPE "BonusBoxAttemptSource" ADD VALUE IF NOT EXISTS 'AUTOFUNNEL';

CREATE TYPE "EngagementBundleScenario" AS ENUM ('EXTEND_90_BONUS', 'COMEBACK_TODAY', 'ACTIVE_DOUBLE_REWARD');

ALTER TABLE "Payment" ADD COLUMN "engagementBundleId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "engagementBundleSnapshot" JSONB;

CREATE TABLE "EngagementBundleSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scenario" "EngagementBundleScenario" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cta" TEXT NOT NULL DEFAULT 'Открыть',
    "href" TEXT,
    "minPlanDurationDays" INTEGER,
    "bonusAttempts" INTEGER NOT NULL DEFAULT 0,
    "bonusMultiplier" INTEGER NOT NULL DEFAULT 1,
    "promoCodeId" TEXT,
    "showOnHome" BOOLEAN NOT NULL DEFAULT true,
    "showOnPlans" BOOLEAN NOT NULL DEFAULT true,
    "showInBroadcasts" BOOLEAN NOT NULL DEFAULT true,
    "showAsPersonalOffer" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementBundleSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeasonalBonusEvent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "recurringWeekday" INTEGER,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "notifyTelegram" BOOLEAN NOT NULL DEFAULT true,
    "actionHref" TEXT NOT NULL DEFAULT '/dashboard/bonus-box',
    "actionLabel" TEXT NOT NULL DEFAULT 'Открыть bonus box',
    "bonusAttempts" INTEGER NOT NULL DEFAULT 0,
    "promoCodeId" TEXT,
    "notificationCooldownHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonalBonusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutoFunnelSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "triggerDays" INTEGER NOT NULL DEFAULT 7,
    "cooldownDays" INTEGER NOT NULL DEFAULT 14,
    "channels" TEXT[] NOT NULL DEFAULT ARRAY['IN_APP', 'TELEGRAM']::TEXT[],
    "messageTitle" TEXT NOT NULL,
    "messageBody" TEXT NOT NULL,
    "actionHref" TEXT NOT NULL DEFAULT '/dashboard',
    "actionLabel" TEXT NOT NULL DEFAULT 'Открыть',
    "actionOpenInTelegram" BOOLEAN NOT NULL DEFAULT true,
    "bonusAttempts" INTEGER NOT NULL DEFAULT 0,
    "promoCodeId" TEXT,
    "maxRecipientsPerRun" INTEGER NOT NULL DEFAULT 500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoFunnelSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeasonalBonusEventDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "attemptsGranted" INTEGER NOT NULL DEFAULT 0,
    "promoCodeId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonalBonusEventDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutoFunnelDelivery" (
    "id" TEXT NOT NULL,
    "funnelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "giftGranted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AutoFunnelDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EngagementBundleSetting_key_key" ON "EngagementBundleSetting"("key");
CREATE INDEX "EngagementBundleSetting_enabled_priority_idx" ON "EngagementBundleSetting"("enabled", "priority");
CREATE INDEX "EngagementBundleSetting_promoCodeId_idx" ON "EngagementBundleSetting"("promoCodeId");
CREATE INDEX "Payment_engagementBundleId_idx" ON "Payment"("engagementBundleId");

CREATE UNIQUE INDEX "SeasonalBonusEvent_key_key" ON "SeasonalBonusEvent"("key");
CREATE INDEX "SeasonalBonusEvent_enabled_startsAt_endsAt_idx" ON "SeasonalBonusEvent"("enabled", "startsAt", "endsAt");
CREATE INDEX "SeasonalBonusEvent_promoCodeId_idx" ON "SeasonalBonusEvent"("promoCodeId");
CREATE UNIQUE INDEX "SeasonalBonusEventDelivery_eventId_userId_key" ON "SeasonalBonusEventDelivery"("eventId", "userId");
CREATE INDEX "SeasonalBonusEventDelivery_userId_notifiedAt_idx" ON "SeasonalBonusEventDelivery"("userId", "notifiedAt");
CREATE INDEX "SeasonalBonusEventDelivery_eventId_claimedAt_idx" ON "SeasonalBonusEventDelivery"("eventId", "claimedAt");
CREATE INDEX "SeasonalBonusEventDelivery_promoCodeId_idx" ON "SeasonalBonusEventDelivery"("promoCodeId");

CREATE UNIQUE INDEX "AutoFunnelSetting_key_key" ON "AutoFunnelSetting"("key");
CREATE INDEX "AutoFunnelSetting_enabled_segment_idx" ON "AutoFunnelSetting"("enabled", "segment");
CREATE INDEX "AutoFunnelSetting_promoCodeId_idx" ON "AutoFunnelSetting"("promoCodeId");

CREATE INDEX "AutoFunnelDelivery_funnelId_sentAt_idx" ON "AutoFunnelDelivery"("funnelId", "sentAt");
CREATE INDEX "AutoFunnelDelivery_userId_sentAt_idx" ON "AutoFunnelDelivery"("userId", "sentAt");

ALTER TABLE "EngagementBundleSetting" ADD CONSTRAINT "EngagementBundleSetting_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_engagementBundleId_fkey" FOREIGN KEY ("engagementBundleId") REFERENCES "EngagementBundleSetting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SeasonalBonusEvent" ADD CONSTRAINT "SeasonalBonusEvent_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SeasonalBonusEventDelivery" ADD CONSTRAINT "SeasonalBonusEventDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SeasonalBonusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonalBonusEventDelivery" ADD CONSTRAINT "SeasonalBonusEventDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonalBonusEventDelivery" ADD CONSTRAINT "SeasonalBonusEventDelivery_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutoFunnelSetting" ADD CONSTRAINT "AutoFunnelSetting_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutoFunnelDelivery" ADD CONSTRAINT "AutoFunnelDelivery_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "AutoFunnelSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutoFunnelDelivery" ADD CONSTRAINT "AutoFunnelDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EngagementBundleSetting" ("id", "key", "scenario", "enabled", "priority", "title", "description", "cta", "href", "minPlanDurationDays", "bonusAttempts", "bonusMultiplier", "showOnHome", "showOnPlans", "showInBroadcasts", "showAsPersonalOffer", "updatedAt")
VALUES
  ('bundle_extend_90_bonus', 'EXTEND_90_BONUS', 'EXTEND_90_BONUS', true, 10, 'Продлите на 90 дней', 'Получите 6 открытий bonus box за продление длинного тарифа.', 'Выбрать 90 дней', '/dashboard/plans?bundle=EXTEND_90_BONUS', 90, 6, 1, true, true, true, true, CURRENT_TIMESTAMP),
  ('bundle_comeback_today', 'COMEBACK_TODAY', 'COMEBACK_TODAY', true, 20, 'Вернитесь сегодня', 'Скидка 35% и 2 открытия bonus box для возвращения.', 'Вернуться со скидкой', '/dashboard/plans?bundle=COMEBACK_TODAY', 30, 2, 1, true, true, true, true, CURRENT_TIMESTAMP),
  ('bundle_active_double_reward', 'ACTIVE_DOUBLE_REWARD', 'ACTIVE_DOUBLE_REWARD', true, 30, 'x2 награды за раннее продление', 'Продлите активную подписку заранее и получите удвоенные открытия.', 'Продлить заранее', '/dashboard/plans?bundle=ACTIVE_DOUBLE_REWARD', 30, 0, 2, true, true, true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "SeasonalBonusEvent" ("id", "key", "enabled", "title", "description", "audience", "recurringWeekday", "notifyInApp", "notifyTelegram", "actionHref", "actionLabel", "bonusAttempts", "notificationCooldownHours", "updatedAt")
VALUES
  ('season_telegram_drop', 'TELEGRAM_DROP', true, 'Telegram Drop', 'Откройте кабинет в Telegram и заберите сезонный drop.', 'ALL', NULL, true, true, '/dashboard/bonus-box', 'Открыть drop', 1, 24, CURRENT_TIMESTAMP),
  ('season_comeback_event', 'COMEBACK_EVENT', true, 'Comeback Event', 'Для возвращения доступны подарки и персональные офферы.', 'INACTIVE', NULL, true, true, '/dashboard/plans?bundle=COMEBACK_TODAY', 'Вернуться', 0, 24, CURRENT_TIMESTAMP),
  ('season_weekend_box', 'WEEKEND_BOX', true, 'Weekend Box', 'Каждую пятницу доступно дополнительное открытие bonus box.', 'ALL', 5, true, true, '/dashboard/bonus-box', 'Открыть box', 1, 24, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AutoFunnelSetting" ("id", "key", "enabled", "title", "segment", "triggerDays", "cooldownDays", "channels", "messageTitle", "messageBody", "actionHref", "actionLabel", "actionOpenInTelegram", "bonusAttempts", "maxRecipientsPerRun", "updatedAt")
VALUES
  ('funnel_new_no_purchase', 'NEW_NO_PURCHASE', false, 'Новый без покупки', 'NEW_NO_PURCHASE', 1, 7, ARRAY['IN_APP', 'TELEGRAM']::TEXT[], 'Подарок на первый VPN', 'Вы зарегистрировались, но ещё не брали подписку. В кабинете ждёт стартовый оффер.', '/dashboard/plans', 'Выбрать тариф', true, 1, 500, CURRENT_TIMESTAMP),
  ('funnel_subscription_expiring', 'SUBSCRIPTION_EXPIRING', false, 'Подписка скоро закончится', 'SUBSCRIPTION_EXPIRING', 3, 3, ARRAY['IN_APP', 'TELEGRAM']::TEXT[], 'Подписка скоро закончится', 'Продлите заранее, чтобы доступ не прерывался, и заберите бонус.', '/dashboard/plans?bundle=ACTIVE_DOUBLE_REWARD', 'Продлить', true, 0, 500, CURRENT_TIMESTAMP),
  ('funnel_inactive_n_days', 'INACTIVE_N_DAYS', false, 'Давно не покупал', 'INACTIVE_N_DAYS', 45, 14, ARRAY['IN_APP', 'TELEGRAM']::TEXT[], 'Можно вернуться выгоднее', 'Подписка давно закончилась. Для возвращения доступен comeback-оффер.', '/dashboard/plans?bundle=COMEBACK_TODAY', 'Вернуться', true, 0, 500, CURRENT_TIMESTAMP),
  ('funnel_active_user', 'ACTIVE_USER', false, 'Активный пользователь', 'ACTIVE_USER', 14, 14, ARRAY['IN_APP', 'TELEGRAM']::TEXT[], 'Усиленный бонус за продление', 'У вас активная подписка. Продлите заранее и получите больше открытий bonus box.', '/dashboard/plans?bundle=ACTIVE_DOUBLE_REWARD', 'Забрать x2', true, 0, 500, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
