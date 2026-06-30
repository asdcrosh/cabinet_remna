import { prisma } from './prisma'

export type IdentityDuplicateCandidate = {
  technicalUserId: string
  technicalEmail: string
  technicalName: string | null
  technicalTelegramId: bigint | null
  emailUserId: string
  email: string
  emailName: string | null
  reason: string
  createdDistanceMinutes: number | null
}

export async function findIdentityDuplicateCandidates(limit = 30) {
  return prisma.$queryRaw<IdentityDuplicateCandidate[]>`
    WITH candidates AS (
      SELECT
        technical.id AS "technicalUserId",
        technical.email AS "technicalEmail",
        technical.name AS "technicalName",
        technical."telegramId" AS "technicalTelegramId",
        technical."createdAt" AS "technicalCreatedAt",
        email_user.id AS "emailUserId",
        email_user.email AS "email",
        email_user.name AS "emailName",
        abs(extract(epoch FROM (technical."createdAt" - email_user."createdAt")) / 60)::int AS "createdDistanceMinutes",
        count(*) OVER (PARTITION BY technical.id) AS "matchCount"
      FROM "User" technical
      JOIN "User" email_user
        ON email_user.id <> technical.id
       AND email_user.email NOT LIKE 'telegram-%@pending.invalid'
       AND lower(trim(coalesce(email_user.email, ''))) NOT LIKE 'telegram-%@pending.invalid'
       AND email_user."telegramId" IS NULL
       AND length(trim(coalesce(technical.name, ''))) >= 4
       AND lower(trim(coalesce(technical.name, ''))) = lower(trim(coalesce(email_user.name, '')))
       AND abs(extract(epoch FROM (technical."createdAt" - email_user."createdAt")) / 60) <= 180
      WHERE technical.email LIKE 'telegram-%@pending.invalid'
        AND technical."telegramId" IS NOT NULL
        AND technical."remnashopUserId" IS NOT NULL
    )
    SELECT
      "technicalUserId",
      "technicalEmail",
      "technicalName",
      "technicalTelegramId",
      "emailUserId",
      "email",
      "emailName",
      'same_name_recent' AS "reason",
      "createdDistanceMinutes"
    FROM candidates
    WHERE "matchCount" = 1
    ORDER BY "technicalCreatedAt" DESC
    LIMIT ${limit}
  `
}
