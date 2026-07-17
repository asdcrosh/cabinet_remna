CREATE TABLE "PaymentProviderSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "yookassaEnabled" BOOLEAN,
    "yookassaShopId" TEXT,
    "yookassaSecretKeyEncrypted" TEXT,
    "yookassaWebhookAllowedIps" TEXT,
    "payAnyWayEnabled" BOOLEAN,
    "payAnyWayMerchantId" TEXT,
    "payAnyWayIntegrityCodeEncrypted" TEXT,
    "payAnyWayTestMode" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderSetting_pkey" PRIMARY KEY ("id")
);

ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_PAYMENT_PROVIDERS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_PAYMENT_PROVIDERS_RESET';
