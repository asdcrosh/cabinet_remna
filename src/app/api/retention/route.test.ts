import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  withDistributedLock: vi.fn(),
  getRetentionState: vi.fn(),
  pauseSubscription: vi.fn(),
  recordAutoRenewalCancellation: vi.fn(),
  resumeSubscription: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/distributed-lock', () => ({ withDistributedLock: mocks.withDistributedLock }))
vi.mock('@/lib/subscription-retention', () => ({
  getRetentionState: mocks.getRetentionState,
  pauseSubscription: mocks.pauseSubscription,
  recordAutoRenewalCancellation: mocks.recordAutoRenewalCancellation,
  resumeSubscription: mocks.resumeSubscription,
  RetentionError: class RetentionError extends Error {
    status = 409
  },
}))

import { POST } from './route'

function pauseRequest() {
  return new Request('https://cabinet.example/api/retention', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'PAUSE',
      reason: 'NOT_USING',
      pauseDays: 7,
    }),
  })
}

describe('retention route billing coordination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1' })
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.withDistributedLock.mockImplementation(
      async (_key: string, task: () => Promise<unknown>) => ({ acquired: true, value: await task() })
    )
    mocks.getRetentionState.mockResolvedValue({ id: 'pause-1' })
  })

  it('pauses the subscription while holding the billing operation lock', async () => {
    const response = await POST(pauseRequest())

    expect(response.status).toBe(200)
    expect(mocks.withDistributedLock).toHaveBeenCalledWith(
      'billing-operation:user-1',
      expect.any(Function),
      { timeoutMs: 30_000 }
    )
    expect(mocks.pauseSubscription).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'PAUSE',
      reason: 'NOT_USING',
      pauseDays: 7,
    })
  })

  it('does not pause access while an automatic charge is running', async () => {
    mocks.withDistributedLock.mockResolvedValue({ acquired: false })

    const response = await POST(pauseRequest())

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Списание уже выполняется. Проверьте его результат перед изменением подписки.',
    })
    expect(mocks.pauseSubscription).not.toHaveBeenCalled()
  })
})
