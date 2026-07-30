import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}))

import { withDistributedLock } from './distributed-lock'

describe('withDistributedLock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (
      callback: (tx: { $queryRaw: typeof mocks.queryRaw }) => Promise<unknown>
    ) => callback({ $queryRaw: mocks.queryRaw }))
  })

  it('runs the task while the transaction lock is held', async () => {
    mocks.queryRaw.mockResolvedValue([{ acquired: true }])
    const task = vi.fn().mockResolvedValue('done')

    await expect(withDistributedLock('telegram-sync:user-1', task)).resolves.toEqual({
      acquired: true,
      value: 'done',
    })
    expect(task).toHaveBeenCalledOnce()
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 45_000,
    })
  })

  it('does not run a second concurrent task', async () => {
    mocks.queryRaw.mockResolvedValue([{ acquired: false }])
    const task = vi.fn()

    await expect(withDistributedLock('telegram-sync:user-1', task)).resolves.toEqual({
      acquired: false,
    })
    expect(task).not.toHaveBeenCalled()
  })
})
