import { randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { remnashopQuery } from './remnashop-db'
import { generateUniqueReferralCode } from './referrals'

interface RemnashopUserRow {
  id: number
  telegram_id: string | null
  email: string | null
  is_email_verified: boolean
  name: string
  username: string | null
}

export async function findRemnashopUserByEmail(email: string) {
  const result = await remnashopQuery<RemnashopUserRow>(
    `
      SELECT id, telegram_id::text AS telegram_id, email, is_email_verified, name, username
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email]
  )
  return result.rows[0] ?? null
}

export async function syncRemnashopUsersToCabinet() {
  const result = await remnashopQuery<RemnashopUserRow>(`
    SELECT id, telegram_id::text AS telegram_id, email, is_email_verified, name, username
    FROM users
    ORDER BY id
  `)
  let created = 0
  let updated = 0
  let skipped = 0

  for (const source of result.rows) {
    const telegramId = source.telegram_id ? BigInt(source.telegram_id) : null
    const email = source.email?.trim().toLowerCase() || null
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { remnashopUserId: source.id },
          ...(telegramId ? [{ telegramId }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
    })

    try {
      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            remnashopUserId: existing.remnashopUserId ?? source.id,
            remnashopSyncedAt: new Date(),
            telegramId: existing.telegramId ?? telegramId,
            telegramUsername: existing.telegramUsername ?? source.username,
            telegramLinkedAt: existing.telegramLinkedAt ?? (telegramId ? new Date() : null),
            name: existing.name ?? source.name,
            emailVerifiedAt:
              existing.emailVerifiedAt ?? (email === existing.email && source.is_email_verified ? new Date() : null),
          },
        })
        updated += 1
        continue
      }

      if (!telegramId && !email) {
        skipped += 1
        continue
      }

      await prisma.user.create({
        data: {
          email: email ?? `telegram-${telegramId!.toString()}@pending.invalid`,
          passwordHash: await hash(randomBytes(48).toString('base64url'), 12),
          name: source.name,
          role: 'USER',
          referralCode: await generateUniqueReferralCode(),
          telegramId,
          telegramUsername: source.username,
          telegramLinkedAt: telegramId ? new Date() : null,
          emailVerifiedAt: email && source.is_email_verified ? new Date() : null,
          remnashopUserId: source.id,
          remnashopSyncedAt: new Date(),
        },
      })
      created += 1
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        skipped += 1
        continue
      }
      throw error
    }
  }

  return { total: result.rows.length, created, updated, skipped }
}
