import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), listMobileSessions: vi.fn() }))
vi.mock('@/lib/auth/guard', () => ({ requireAuth: mocks.requireAuth, withAuth: (handler: unknown) => handler }))
vi.mock('@/lib/auth/mobile-session', () => ({ listMobileSessions: mocks.listMobileSessions }))

import { GET } from './route'

describe('GET /api/mobile/auth/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listMobileSessions.mockResolvedValue([{ id: 'ms-1' }, { id: 'ms-2' }])
  })

  it('отмечает текущее устройство для запроса из приложения', async () => {
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1', aud: 'mobile', sid: 'ms-2' })
    const body = await (await GET()).json()
    expect(body.sessions).toEqual([{ id: 'ms-1', current: false }, { id: 'ms-2', current: true }])
    expect(mocks.listMobileSessions).toHaveBeenCalledWith('user-1')
  })

  it('из веб-кабинета текущего устройства нет', async () => {
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1' })
    const body = await (await GET()).json()
    expect(body.sessions.every((s: { current: boolean }) => !s.current)).toBe(true)
  })
})
