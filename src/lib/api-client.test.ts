import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock('@/components/ui/toaster', () => ({ toast: mocks.toast }))
vi.mock('@/lib/admin-error-report', () => ({ isAdminErrorPresentationActive: () => false }))

import { apiFetch, SESSION_EXPIRED_EVENT } from './api-client'

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

  it('can suppress mutation toasts for background polling', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
      { error: 'Сервис временно недоступен.' },
      { status: 503 }
    )))

    await expect(apiFetch('/api/payment/status', { method: 'POST', silent: true }))
      .rejects.toThrow('Сервис временно недоступен')
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('offers reauthentication without navigating away from an unsaved dashboard form', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', {
      location: {
        pathname: '/dashboard/support',
        search: '?ticket=ticket-1',
      },
      dispatchEvent,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )))

    await expect(apiFetch('/api/support/tickets/ticket-1', { method: 'POST' }))
      .rejects.toMatchObject({ status: 401 })

    expect(dispatchEvent).toHaveBeenCalledOnce()
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent<{ next: string }>
    expect(event.type).toBe(SESSION_EXPIRED_EVENT)
    expect(event.detail).toEqual({ next: '/dashboard/support?ticket=ticket-1' })
  })
})
