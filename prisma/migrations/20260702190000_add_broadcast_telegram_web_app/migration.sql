ALTER TABLE "BroadcastCampaign"
  ADD COLUMN "actionOpenInTelegram" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BroadcastTemplate"
  ADD COLUMN "actionOpenInTelegram" BOOLEAN NOT NULL DEFAULT false;
