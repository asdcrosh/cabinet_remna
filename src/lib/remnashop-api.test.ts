import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authenticateRemnashopEmail,
  changeRemnashopPassword,
  ensureRemnashopTelegramUser,
  registerRemnashopEmailUser,
} from './remnashop-api'

const originalUrl = process.env.REMNASHOP_API_URL

afterEach(() => {
  process.env.REMNASHOP_API_URL = originalUrl
  vi.restoreAllMocks()
})

describe('Remnashop public API client', () => {
  it('registers cabinet email users through the official endpoint', async () => {
    process.env.REMNASHOP_API_URL = 'http://remnashop:5000/api/v1/public'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ expires_at: '2026-01-01', refresh_expires_at: '2026-02-01' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(
      registerRemnashopEmailUser({
        email: 'user@example.com',
        password: 'Password1',
        name: 'User',
      })
    ).resolves.toEqual({ configured: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://remnashop:5000/api/v1/public/auth/register',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('treats an existing remnashop user as an already synchronized identity', async () => {
    process.env.REMNASHOP_API_URL = 'http://remnashop:5000/api/v1/public'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Email already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(
      registerRemnashopEmailUser({
        email: 'user@example.com',
        password: 'Password1',
      })
    ).resolves.toEqual({ configured: true, alreadyExists: true })
  })

  it('authenticates imported email users and Telegram Mini App users', async () => {
    process.env.REMNASHOP_API_URL = 'http://remnashop:5000/api/v1/public'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ expires_at: '2026-01-01', refresh_expires_at: '2026-02-01' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(authenticateRemnashopEmail('user@example.com', 'Password1')).resolves.toBe(true)
    await expect(ensureRemnashopTelegramUser('signed-init-data')).resolves.toEqual({ configured: true })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://remnashop:5000/api/v1/public/auth/telegram/webapp',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('changes the Remnashop password in the same operation as Cabinet', async () => {
    process.env.REMNASHOP_API_URL = 'http://remnashop:5000/api/v1/public'
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ expires_at: '2026-01-01' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': 'access_token=token-1; Path=/; HttpOnly',
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

    await expect(changeRemnashopPassword({
      email: 'user@example.com',
      currentPassword: 'Password1',
      newPassword: 'Password2',
    })).resolves.toEqual({ configured: true, changed: true })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://remnashop:5000/api/v1/public/auth/change-password',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Cookie: 'access_token=token-1' }),
      })
    )
  })

  it('reports legacy password divergence without changing either side', async () => {
    process.env.REMNASHOP_API_URL = 'http://remnashop:5000/api/v1/public'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(changeRemnashopPassword({
      email: 'user@example.com',
      currentPassword: 'Password1',
      newPassword: 'Password2',
    })).resolves.toEqual({
      configured: true,
      changed: false,
      reason: 'current_password_mismatch',
      detail: 'Invalid credentials',
    })
  })
})
