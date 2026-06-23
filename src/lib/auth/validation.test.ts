import { describe, expect, it } from 'vitest'
import { registerSchema } from './validation'

const baseInput = {
  email: 'user@example.com',
  password: 'Password1',
  agreeToTerms: true,
}

describe('auth validation', () => {
  it('accepts normal names', () => {
    expect(registerSchema.safeParse({ ...baseInput, name: 'Артем Алексеев' }).success).toBe(true)
    expect(registerSchema.safeParse({ ...baseInput, name: "Anne-Marie O'Neil" }).success).toBe(true)
  })

  it('rejects noisy names', () => {
    expect(registerSchema.safeParse({ ...baseInput, name: 'A' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...baseInput, name: 'Артем123' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...baseInput, name: 'Артем  Алексеев' }).success).toBe(true)
    expect(registerSchema.safeParse({ ...baseInput, name: 'Артем--Алексеев' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...baseInput, name: 'A'.repeat(41) }).success).toBe(false)
  })
})
