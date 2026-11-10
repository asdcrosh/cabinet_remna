ALTER TABLE "User" ADD COLUMN "mobileTelegramEmailDueAt" TIMESTAMP(3);
ALTER TABLE "MobileAuthCode" ADD COLUMN "telegramId" BIGINT;

CREATE TABLE "MobileEmailChallenge" (
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MobileEmailChallenge_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "MobileEmailChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
