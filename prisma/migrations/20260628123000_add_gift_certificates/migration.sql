CREATE TYPE "GiftCertificateRedemptionStatus" AS ENUM ('SUCCEEDED', 'CANCELED');

CREATE TABLE "GiftCertificate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "maxUsesPerUser" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCertificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GiftCertificateRedemption" (
    "id" TEXT NOT NULL,
    "giftCertificateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "status" "GiftCertificateRedemptionStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "codeSnapshot" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCertificateRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GiftCertificate_code_key" ON "GiftCertificate"("code");
CREATE INDEX "GiftCertificate_isActive_startsAt_expiresAt_idx" ON "GiftCertificate"("isActive", "startsAt", "expiresAt");
CREATE INDEX "GiftCertificate_planId_idx" ON "GiftCertificate"("planId");
CREATE UNIQUE INDEX "GiftCertificateRedemption_paymentId_key" ON "GiftCertificateRedemption"("paymentId");
CREATE INDEX "GiftCertificateRedemption_giftCertificateId_status_idx" ON "GiftCertificateRedemption"("giftCertificateId", "status");
CREATE INDEX "GiftCertificateRedemption_userId_giftCertificateId_status_idx" ON "GiftCertificateRedemption"("userId", "giftCertificateId", "status");

ALTER TABLE "GiftCertificate" ADD CONSTRAINT "GiftCertificate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GiftCertificateRedemption" ADD CONSTRAINT "GiftCertificateRedemption_giftCertificateId_fkey" FOREIGN KEY ("giftCertificateId") REFERENCES "GiftCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftCertificateRedemption" ADD CONSTRAINT "GiftCertificateRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftCertificateRedemption" ADD CONSTRAINT "GiftCertificateRedemption_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
