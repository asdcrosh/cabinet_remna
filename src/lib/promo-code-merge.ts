import { randomBytes } from 'crypto'
import { Prisma, type BonusBoxRarity } from '@prisma/client'
import { prisma } from './prisma'
import { remnashopQuery } from './remnashop-db'
import { logWarn } from './logger'

/**
 * Объединение промокодов из рулетки: пользователь выбирает несколько своих кодов
 * и получает вместо них один, сильнее и со свежим сроком.
 *
 * Скидка = max(лучший код, ⌊сумма × коэффициент⌋), но не больше потолка.
 * Коды на потолок и выше (главный приз) не объединяются.
 */

export const PROMO_MERGE_MIN_CODES = 2
export const PROMO_MERGE_MAX_CODES = 6
const IN_USE = ['PENDING', 'SUCCEEDED'] as const

export type PromoMergeSettings = {
  enabled: boolean
  coefficientPercent: number
  capPercent: number
  ttlDays: number
}

export type PromoMergeBlockReason = 'AT_CAP' | 'RESTRICTED'

export type PromoMergeCode = {
  id: string
  code: string
  discountPercent: number
  expiresAt: string
  rarity: BonusBoxRarity
  merged: boolean
  mergeable: boolean
  reason: PromoMergeBlockReason | null
}

export type PromoMergeOverview = {
  enabled: boolean
  coefficientPercent: number
  capPercent: number
  ttlDays: number
  minCodes: number
  maxCodes: number
  canMerge: boolean
  codes: PromoMergeCode[]
}

export class PromoMergeError extends Error {
  constructor(message: string, public status = 400, public code = 'PROMO_MERGE_ERROR') {
    super(message)
    this.name = 'PromoMergeError'
  }
}

export function calculateMergedDiscount(
  percents: number[],
  settings: Pick<PromoMergeSettings, 'coefficientPercent' | 'capPercent'>
) {
  if (percents.length === 0) return 0
  const best = Math.max(...percents)
  const sum = percents.reduce((total, value) => total + value, 0)
  const boosted = Math.floor((sum * settings.coefficientPercent) / 100)
  return Math.min(settings.capPercent, Math.max(best, boosted))
}

/** Цвет редкости для объединённого кода — по силе скидки относительно потолка. */
export function mergedRarity(discountPercent: number, capPercent: number): BonusBoxRarity {
  if (discountPercent >= capPercent) return 'LEGENDARY'
  if (discountPercent >= 20) return 'EPIC'
  if (discountPercent >= 10) return 'RARE'
  return 'COMMON'
}

type CandidateClient = Pick<Prisma.TransactionClient, 'promoCode'>

const candidateInclude = Prisma.validator<Prisma.PromoCodeInclude>()({
  plans: { select: { planId: true } },
  redemptions: { where: { status: { in: [...IN_USE] } }, select: { id: true } },
  bonusBoxOpenings: { select: { userId: true, prize: { select: { rarity: true } } } },
  mergeResult: { select: { userId: true } },
})

type Candidate = Prisma.PromoCodeGetPayload<{ include: typeof candidateInclude }>

function ownedByUserWhere(userId: string): Prisma.PromoCodeWhereInput {
  return {
    OR: [
      { bonusBoxOpenings: { some: { userId } } },
      { mergeResult: { is: { userId } } },
    ],
  }
}

async function findCandidates(client: CandidateClient, userId: string, now: Date, ids?: string[]) {
  return client.promoCode.findMany({
    where: {
      ...(ids ? { id: { in: ids } } : {}),
      AND: [
        ownedByUserWhere(userId),
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      ],
      isActive: true,
      maxUses: 1,
      expiresAt: { gt: now },
      redemptions: { none: { status: { in: [...IN_USE] } } },
    },
    include: candidateInclude,
    orderBy: [{ expiresAt: 'asc' }, { discountPercent: 'desc' }],
  })
}

function blockReason(candidate: Candidate, settings: PromoMergeSettings): PromoMergeBlockReason | null {
  if (candidate.discountPercent >= settings.capPercent) return 'AT_CAP'
  if (candidate.purchaseScope !== 'ANY' || candidate.plans.length > 0) return 'RESTRICTED'
  return null
}

function candidateRarity(candidate: Candidate, settings: PromoMergeSettings): BonusBoxRarity {
  return candidate.bonusBoxOpenings[0]?.prize.rarity
    ?? mergedRarity(candidate.discountPercent, settings.capPercent)
}

function toView(candidate: Candidate, settings: PromoMergeSettings): PromoMergeCode {
  const reason = blockReason(candidate, settings)
  return {
    id: candidate.id,
    code: candidate.code,
    discountPercent: candidate.discountPercent,
    expiresAt: (candidate.expiresAt as Date).toISOString(),
    rarity: candidateRarity(candidate, settings),
    merged: Boolean(candidate.mergeResult),
    mergeable: settings.enabled && reason === null,
    reason,
  }
}

export async function getPromoMergeOverview(
  userId: string,
  settings: PromoMergeSettings,
  now = new Date()
): Promise<PromoMergeOverview> {
  const candidates = await findCandidates(prisma, userId, now)
  const codes = candidates.map((candidate) => toView(candidate, settings))
  return {
    enabled: settings.enabled,
    coefficientPercent: settings.coefficientPercent,
    capPercent: settings.capPercent,
    ttlDays: settings.ttlDays,
    minCodes: PROMO_MERGE_MIN_CODES,
    maxCodes: PROMO_MERGE_MAX_CODES,
    canMerge: settings.enabled && codes.filter((code) => code.mergeable).length >= PROMO_MERGE_MIN_CODES,
    codes,
  }
}

export type PromoMergeResult = {
  promoCode: PromoMergeCode
  sourcePercents: number[]
  bestSourcePercent: number
  replayed: boolean
}

function resultFromMerge(
  merge: { sourcePercents: number[]; capPercent: number; resultPromo: { id: string; code: string; discountPercent: number; expiresAt: Date | null } },
  replayed: boolean
): PromoMergeResult {
  const { resultPromo } = merge
  return {
    promoCode: {
      id: resultPromo.id,
      code: resultPromo.code,
      discountPercent: resultPromo.discountPercent,
      expiresAt: (resultPromo.expiresAt ?? new Date()).toISOString(),
      rarity: mergedRarity(resultPromo.discountPercent, merge.capPercent),
      merged: true,
      mergeable: false,
      reason: null,
    },
    sourcePercents: merge.sourcePercents,
    bestSourcePercent: Math.max(...merge.sourcePercents),
    replayed,
  }
}

/** Код, уже активированный в боте Remnashop, кабинет мог ещё не увидеть — проверяем напрямую. */
async function assertNotUsedInRemnashop(remnashopIds: number[]) {
  if (remnashopIds.length === 0 || !process.env.REMNASHOP_DATABASE_URL) return
  try {
    const { rows: [usage] } = await remnashopQuery<{ used: number }>(
      'SELECT count(*)::int AS used FROM promocode_activations WHERE promocode_id = ANY($1::int[])',
      [remnashopIds]
    )
    if ((usage?.used ?? 0) > 0) {
      throw new PromoMergeError('Один из промокодов уже использован', 409, 'PROMO_MERGE_CODE_USED')
    }
  } catch (error) {
    if (error instanceof PromoMergeError) throw error
    logWarn('promo_merge.remnashop_check_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    throw new PromoMergeError('Не удалось проверить промокоды. Попробуйте позже.', 503, 'PROMO_MERGE_CHECK_FAILED')
  }
}

function newBoxCode() {
  return `BOX-${randomBytes(4).toString('hex').toUpperCase()}`
}

export async function mergePromoCodes(input: {
  userId: string
  promoCodeIds: string[]
  idempotencyKey: string
  settings: PromoMergeSettings
  now?: Date
}): Promise<PromoMergeResult> {
  const { userId, idempotencyKey, settings } = input
  const now = input.now ?? new Date()

  const existing = await prisma.promoCodeMerge.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
    include: { resultPromo: true },
  })
  if (existing) return resultFromMerge(existing, true)

  if (!settings.enabled) {
    throw new PromoMergeError('Объединение промокодов сейчас недоступно', 403, 'PROMO_MERGE_DISABLED')
  }
  const ids = Array.from(new Set(input.promoCodeIds))
  if (ids.length !== input.promoCodeIds.length) {
    throw new PromoMergeError('Промокоды повторяются', 400, 'PROMO_MERGE_DUPLICATE')
  }
  if (ids.length < PROMO_MERGE_MIN_CODES || ids.length > PROMO_MERGE_MAX_CODES) {
    throw new PromoMergeError(
      `Выберите от ${PROMO_MERGE_MIN_CODES} до ${PROMO_MERGE_MAX_CODES} промокодов`,
      400,
      'PROMO_MERGE_COUNT'
    )
  }

  const precheck = await findCandidates(prisma, userId, now, ids)
  if (precheck.length !== ids.length) {
    throw new PromoMergeError('Некоторые промокоды уже недоступны. Обновите страницу.', 409, 'PROMO_MERGE_UNAVAILABLE')
  }
  await assertNotUsedInRemnashop(
    precheck.flatMap((code) => (code.remnashopPromoCodeId ? [code.remnashopPromoCodeId] : []))
  )

  let result: PromoMergeResult
  try {
    result = await prisma.$transaction(async (tx) => {
      // Оплата с промокодом идёт в Serializable-транзакции: параллельные оплата и объединение
      // одного кода не пройдут обе.
      await tx.$queryRaw`SELECT id FROM "PromoCode" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`
      const sources = await findCandidates(tx, userId, now, ids)
      if (sources.length !== ids.length) {
        throw new PromoMergeError('Некоторые промокоды уже недоступны. Обновите страницу.', 409, 'PROMO_MERGE_UNAVAILABLE')
      }
      const blocked = sources.find((source) => blockReason(source, settings) !== null)
      if (blocked) {
        throw new PromoMergeError(
          blockReason(blocked, settings) === 'AT_CAP'
            ? 'Этот промокод уже сильнее любого объединения'
            : 'Этот промокод нельзя объединить',
          400,
          'PROMO_MERGE_NOT_ALLOWED'
        )
      }

      const sourcePercents = sources.map((source) => source.discountPercent)
      const discountPercent = calculateMergedDiscount(sourcePercents, settings)
      const expiresAt = new Date(now.getTime() + settings.ttlDays * 24 * 60 * 60 * 1000)

      await tx.promoCode.updateMany({ where: { id: { in: ids } }, data: { isActive: false } })

      let resultPromo: Prisma.PromoCodeGetPayload<object> | null = null
      for (let attempt = 0; attempt < 8 && !resultPromo; attempt++) {
        const code = newBoxCode()
        const taken = await tx.promoCode.findUnique({ where: { code }, select: { id: true } })
        if (taken) continue
        resultPromo = await tx.promoCode.create({
          data: {
            code,
            discountPercent,
            audience: 'PERSONAL',
            allowedEmails: [],
            purchaseScope: 'ANY',
            isActive: true,
            startsAt: now,
            expiresAt,
            maxUses: 1,
            maxUsesPerUser: 1,
          },
        })
      }
      if (!resultPromo) {
        throw new PromoMergeError('Не удалось создать промокод. Попробуйте ещё раз.', 500, 'PROMO_MERGE_CREATE_FAILED')
      }

      const merge = await tx.promoCodeMerge.create({
        data: {
          userId,
          resultPromoCodeId: resultPromo.id,
          idempotencyKey,
          sourcePromoCodeIds: sources.map((source) => source.id),
          sourceCodes: sources.map((source) => source.code),
          sourcePercents,
          coefficientPercent: settings.coefficientPercent,
          capPercent: settings.capPercent,
        },
        include: { resultPromo: true },
      })
      return resultFromMerge(merge, false)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (error) {
    // Повтор с тем же ключом, пришедший параллельно, — отдаём уже созданный результат.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const replay = await prisma.promoCodeMerge.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
        include: { resultPromo: true },
      })
      if (replay) return resultFromMerge(replay, true)
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new PromoMergeError('Промокод сейчас используется. Попробуйте ещё раз.', 409, 'PROMO_MERGE_CONFLICT')
    }
    throw error
  }

  return result
}

/** Владелец объединённого кода — для проверки аудитории PERSONAL. */
export async function isMergedPromoCodeOwner(
  client: Pick<Prisma.TransactionClient, 'promoCodeMerge'>,
  promoCodeId: string,
  userId: string
) {
  const merge = await client.promoCodeMerge.findUnique({
    where: { resultPromoCodeId: promoCodeId },
    select: { userId: true },
  })
  return merge?.userId === userId
}
