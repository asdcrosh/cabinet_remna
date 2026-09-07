import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock('@/components/ui/toaster', () => ({ toast: mocks.toast }))
vi.mock('@/lib/admin-error-report', () => ({ isAdminErrorPresentationActive: () => false }))

import { apiFetch } from './api-client'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('apiFetch', () => {
  it('retries a safe GET once after a network failure', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = apiFetch<{ ok: boolean }>('/api/example')
    await vi.advanceTimersByTimeAsync(350)

    await expect(resultPromise).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a mutation and returns a readable network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/api/example', { method: 'POST' }))
      .rejects.toThrow('Нет соединения с сервером')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Проверьте интернет'))
  })
})
