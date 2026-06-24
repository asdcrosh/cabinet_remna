// Zod-схемы для валидации входных данных в API-роутах.
// Проверяем на сервере, не доверяем клиенту.

import { z } from 'zod'

const nameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ' '))
  .refine((value) => value.length === 0 || value.length >= 2, 'Минимум 2 символа')
  .refine((value) => value.length <= 40, 'Максимум 40 символов')
  .refine(
    (value) => value.length === 0 || /^[\p{L}][\p{L}\s.'-]*[\p{L}]$/u.test(value),
    'Только буквы, пробел, дефис, точка и апостроф'
  )
  .refine((value) => !/[-.'\s]{2,}/.test(value), 'Уберите повторяющиеся разделители')

export const newPasswordSchema = z
  .string()
  .min(8, 'Минимум 8 символов')
  .max(128, 'Максимум 128 символов')
  .regex(/[A-Za-z]/, 'Должна быть хотя бы одна латинская буква')
  .regex(/[0-9]/, 'Должна быть хотя бы одна цифра')

export const registerSchema = z.object({
  email: z.string().email('Некорректный email').max(255).toLowerCase().trim(),
  password: newPasswordSchema,
  name: nameSchema.optional(),
  referralCode: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional()
    .or(z.literal('')),
  agreeToTerms: z.literal(true, {
    errorMap: () => ({ message: 'Нужно согласиться с условиями' }),
  }),
})

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(128),
})

export const telegramMiniAppEmailSchema = z.object({
  email: z.string().email('Некорректный email').max(255).toLowerCase().trim(),
  password: z.string().min(1, 'Введите пароль').max(128, 'Максимум 128 символов'),
  agreeToTerms: z.literal(true, {
    errorMap: () => ({ message: 'Нужно согласиться с условиями' }),
  }),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Некорректный email').toLowerCase().trim(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  password: newPasswordSchema,
})

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1).max(128),
    newPassword: z
      .string()
      .min(8)
      .max(128)
      .regex(/[A-Za-z]/)
      .regex(/[0-9]/),
  })
  .strict()

export const createPaymentSchema = z.object({
  planId: z.string().min(1).max(64),
  promoCode: z.string().trim().min(1).max(64).optional(),
})

export const validatePromoCodeSchema = z.object({
  planId: z.string().min(1).max(64),
  promoCode: z.string().trim().min(1).max(64),
})

const adminPromoCodeBaseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Минимум 3 символа')
    .max(32, 'Максимум 32 символа')
    .regex(/^[A-Za-z0-9_-]+$/, 'Только латиница, цифры, дефис и подчёркивание'),
  discountPercent: z.coerce.number().int().min(1).max(99),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  maxUses: z.coerce.number().int().min(1).optional().nullable(),
  maxUsesPerUser: z.coerce.number().int().min(1).default(1),
  planIds: z.array(z.string().min(1).max(64)).default([]),
})

function startsBeforeExpires(value: { startsAt?: string | null; expiresAt?: string | null }) {
  if (!value.startsAt || !value.expiresAt) return true
  return new Date(value.startsAt) < new Date(value.expiresAt)
}

export const adminPromoCodeSchema = adminPromoCodeBaseSchema.refine(startsBeforeExpires, {
  path: ['expiresAt'],
  message: 'Дата окончания должна быть позже даты начала',
})

export const updateAdminPromoCodeSchema = adminPromoCodeBaseSchema.partial().refine(startsBeforeExpires, {
  path: ['expiresAt'],
  message: 'Дата окончания должна быть позже даты начала',
})

const adminBonusBoxPrizeBaseSchema = z.object({
  title: z.string().trim().min(2, 'Минимум 2 символа').max(80, 'Максимум 80 символов'),
  description: z.string().trim().max(180, 'Максимум 180 символов').optional().nullable(),
  type: z.enum(['SUBSCRIPTION_DAYS', 'TRAFFIC_GB', 'PROMO_CODE_PERCENT', 'BONUS_ATTEMPTS', 'NO_PRIZE']),
  value: z.coerce.number().int().min(0).max(10_000),
  weight: z.coerce.number().int().min(1).max(100_000),
  rarity: z.enum(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']).default('COMMON'),
  isActive: z.boolean().default(true),
  maxWins: z.coerce.number().int().min(1).optional().nullable(),
  promoExpiresInDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
})

export const adminBonusBoxPrizeSchema = adminBonusBoxPrizeBaseSchema.refine(
  (value) => value.type === 'NO_PRIZE' || value.value >= 1,
  {
    path: ['value'],
    message: 'Значение подарка должно быть больше 0',
  }
).refine(
  (value) => value.type !== 'NO_PRIZE' || value.value === 0,
  {
    path: ['value'],
    message: 'Для исхода без подарка значение должно быть 0',
  }
).refine(
  (value) => value.type !== 'NO_PRIZE' || value.rarity === 'COMMON',
  {
    path: ['rarity'],
    message: 'Исход без подарка должен быть базовым',
  }
).refine(
  (value) => value.type !== 'PROMO_CODE_PERCENT' || value.value <= 99,
  {
    path: ['value'],
    message: 'Скидка должна быть от 1% до 99%',
  }
).refine(
  (value) => value.type !== 'BONUS_ATTEMPTS' || value.value <= 100,
  {
    path: ['value'],
    message: 'Количество открытий должно быть от 1 до 100',
  }
)

export const updateAdminBonusBoxPrizeSchema = adminBonusBoxPrizeBaseSchema.partial().refine(
  (value) => value.type === 'NO_PRIZE' || value.value == null || value.value >= 1,
  {
    path: ['value'],
    message: 'Значение подарка должно быть больше 0',
  }
).refine(
  (value) => value.type !== 'NO_PRIZE' || value.value == null || value.value === 0,
  {
    path: ['value'],
    message: 'Для исхода без подарка значение должно быть 0',
  }
).refine(
  (value) => value.type !== 'NO_PRIZE' || value.rarity == null || value.rarity === 'COMMON',
  {
    path: ['rarity'],
    message: 'Исход без подарка должен быть базовым',
  }
).refine(
  (value) => value.type !== 'PROMO_CODE_PERCENT' || value.value == null || value.value <= 99,
  {
    path: ['value'],
    message: 'Скидка должна быть от 1% до 99%',
  }
).refine(
  (value) => value.type !== 'BONUS_ATTEMPTS' || value.value == null || value.value <= 100,
  {
    path: ['value'],
    message: 'Количество открытий должно быть от 1 до 100',
  }
)

const adminPlanBaseSchema = z.object({
  name: z.string().trim().min(2, 'Минимум 2 символа').max(80, 'Максимум 80 символов'),
  description: z.string().trim().max(240, 'Максимум 240 символов').optional().nullable(),
  priceKopecks: z.coerce.number().int().min(0).max(10_000_000),
  durationDays: z.coerce.number().int().min(1).max(3650),
  trafficLimitGb: z.coerce.number().int().min(1).max(1_000_000).optional().nullable(),
  deviceLimit: z.coerce.number().int().min(1).max(1000),
  activeInternalSquads: z.array(z.string().trim().uuid()).default([]),
  availability: z.enum(['ALL', 'NEW', 'EXISTING', 'INVITED', 'ALLOWED', 'LINK']).default('ALL'),
  allowedEmails: z.array(z.string().trim().email()).max(10_000).default([]),
  allowedTelegramIds: z.array(z.string().trim().regex(/^\d+$/, 'Telegram ID должен состоять из цифр')).max(10_000).default([]),
  isPromo: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(100_000),
})

export const adminPlanSchema = adminPlanBaseSchema

export const updateAdminPlanSchema = adminPlanBaseSchema.partial()

export const updateProfileSchema = z.object({
  name: nameSchema.optional().nullable(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>
export type ValidatePromoCodeInput = z.infer<typeof validatePromoCodeSchema>
export type AdminPromoCodeInput = z.infer<typeof adminPromoCodeSchema>
export type UpdateAdminPromoCodeInput = z.infer<typeof updateAdminPromoCodeSchema>
export type AdminBonusBoxPrizeInput = z.infer<typeof adminBonusBoxPrizeSchema>
export type UpdateAdminBonusBoxPrizeInput = z.infer<typeof updateAdminBonusBoxPrizeSchema>
export type AdminPlanInput = z.infer<typeof adminPlanSchema>
export type UpdateAdminPlanInput = z.infer<typeof updateAdminPlanSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
