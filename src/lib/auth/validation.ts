// Zod-схемы для валидации входных данных в API-роутах.
// Проверяем на сервере, не доверяем клиенту.

import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email('Некорректный email').max(255).toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Минимум 8 символов')
    .max(128, 'Максимум 128 символов')
    .regex(/[A-Za-z]/, 'Должна быть хотя бы одна латинская буква')
    .regex(/[0-9]/, 'Должна быть хотя бы одна цифра'),
  name: z.string().max(64).trim().optional(),
  agreeToTerms: z.literal(true, {
    errorMap: () => ({ message: 'Нужно согласиться с условиями' }),
  }),
})

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(128),
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

const adminPlanBaseSchema = z.object({
  name: z.string().trim().min(2, 'Минимум 2 символа').max(80, 'Максимум 80 символов'),
  description: z.string().trim().max(240, 'Максимум 240 символов').optional().nullable(),
  priceKopecks: z.coerce.number().int().min(0).max(10_000_000),
  durationDays: z.coerce.number().int().min(1).max(3650),
  trafficLimitGb: z.coerce.number().int().min(1).max(1_000_000).optional().nullable(),
  deviceLimit: z.coerce.number().int().min(1).max(1000),
  activeInternalSquads: z.array(z.string().trim().uuid()).default([]),
  isPromo: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(100_000),
})

export const adminPlanSchema = adminPlanBaseSchema

export const updateAdminPlanSchema = adminPlanBaseSchema.partial()

export const updateProfileSchema = z.object({
  name: z.string().max(64).trim().optional().nullable(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>
export type ValidatePromoCodeInput = z.infer<typeof validatePromoCodeSchema>
export type AdminPromoCodeInput = z.infer<typeof adminPromoCodeSchema>
export type UpdateAdminPromoCodeInput = z.infer<typeof updateAdminPromoCodeSchema>
export type AdminPlanInput = z.infer<typeof adminPlanSchema>
export type UpdateAdminPlanInput = z.infer<typeof updateAdminPlanSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
