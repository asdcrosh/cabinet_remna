-- Переключатель нового дизайна кабинета. По умолчанию новый дизайн включён у всех.
ALTER TABLE "FeatureSetting" ADD COLUMN "newDesign" BOOLEAN NOT NULL DEFAULT true;
