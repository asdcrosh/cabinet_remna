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
    SELECT
      technical.id AS "technicalUserId",
      technical.email AS "technicalEmail",
      technical.name AS "technicalName",
      technical."telegramId" AS "technicalTelegramId",
      email_user.id AS "emailUserId",
      email_user.email AS "email",
      email_user.name AS "emailName",
      'same_name' AS "reason",
      abs(extract(epoch FROM (technical."createdAt" - email_user."createdAt")) / 60)::int AS "createdDistanceMinutes"
    FROM "User" technical
    JOIN "User" email_user
      ON email_user.id <> technical.id
     AND email_user.email NOT LIKE 'telegram-%@pending.invalid'
     AND length(trim(coalesce(technical.name, ''))) >= 3
     AND lower(trim(coalesce(technical.name, ''))) = lower(trim(coalesce(email_user.name, '')))
    WHERE technical.email LIKE 'telegram-%@pending.invalid'
      AND technical."telegramId" IS NOT NULL
    ORDER BY technical."createdAt" DESC
    LIMIT ${limit}
  `
}
