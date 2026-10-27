import { describe, expect, it } from 'vitest'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  loginSchema,
  registerSchema,
  updateAdminBonusBoxPrizeSchema,
  updateAdminPlanSchema,
  updateAdminPromoCodeSchema,
} from './validation'

const options = { fields: {}, shouldUseNativeValidation: false } as const

describe('Zod form adapter compatibility', () => {
  it('returns field errors for an invalid login instead of throwing', async () => {
    const resolver = zodResolver(loginSchema)
    const result = await resolver({ email: 'not-an-email', password: '' }, undefined, options)

    expect(result.values).toEqual({})
    expect(result.errors.email?.message).toBeTruthy()
    expect(result.errors.password?.message).toBeTruthy()
  })

  it('preserves normalized values for a valid login', async () => {
    const resolver = zodResolver(loginSchema)
    const result = await resolver({ email: 'OWNER@example.org', password: 'example-password' }, undefined, options)

    expect(result.errors).toEqual({})
    expect(result.values).toEqual({ email: 'owner@example.org', password: 'example-password' })
  })

  it('preserves the consent error shown during registration', () => {
    const result = registerSchema.safeParse({
      email: 'owner@example.org',
      password: 'ExamplePassword123',
      agreeToTerms: false,
      agreeToPersonalData: true,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.agreeToTerms).toEqual(['Нужно согласиться с условиями'])
    }
  })

  it.each([
    { name: 'prize', schema: updateAdminBonusBoxPrizeSchema, input: { weight: 30 } },
    { name: 'plan', schema: updateAdminPlanSchema, input: { name: 'Renamed plan' } },
    { name: 'promo code', schema: updateAdminPromoCodeSchema, input: { discountPercent: 15 } },
  ])('does not reset omitted $name fields during an update', ({ schema, input }) => {
    expect(schema.parse(input)).toEqual(input)
    expect(schema.parse({})).toEqual({})
  })
})
