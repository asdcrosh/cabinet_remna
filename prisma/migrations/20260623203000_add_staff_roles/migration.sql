CREATE TYPE "UserRole_new" AS ENUM ('USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User"
ALTER COLUMN "role" TYPE "UserRole_new"
USING "role"::text::"UserRole_new";

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

UPDATE "User"
SET "role" = 'SUPER_ADMIN'
WHERE "id" = (
  SELECT "id"
  FROM "User"
  WHERE "role" = 'ADMIN'
  ORDER BY "createdAt" ASC
  LIMIT 1
);
