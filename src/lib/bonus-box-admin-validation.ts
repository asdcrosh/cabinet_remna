import { z } from 'zod'

const optionalDate = z.string().datetime().nullable()

export const bonusBoxMissionAdminSchema = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(240).nullable(),
  type: z.enum(['PAYMENT_COUNT', 'REFERRAL_COUNT', 'LOGIN_STREAK']),
  target: z.coerce.number().int().min(1).max(365),
  rewardAttempts: z.coerce.number().int().min(1).max(100),
  isActive: z.boolean(),
  startsAt: optionalDate,
  endsAt: optionalDate,
}).refine(
  (value) => !value.startsAt || !value.endsAt || new Date(value.startsAt) < new Date(value.endsAt),
  { path: ['endsAt'], message: 'Дата окончания должна быть позже даты начала' }
)

export const bonusBoxEventAdminSchema = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(240).nullable(),
  isActive: z.boolean(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  attemptsPerUser: z.coerce.number().int().min(0).max(100),
  weightMultiplier: z.coerce.number().int().min(1).max(20),
  prizeIds: z.array(z.string().min(1)).max(100),
  maxClaims: z.coerce.number().int().min(1).nullable(),
}).refine(
  (value) => new Date(value.startsAt) < new Date(value.endsAt),
  { path: ['endsAt'], message: 'Дата окончания должна быть позже даты начала' }
)
