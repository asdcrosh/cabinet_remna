import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  prize: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { bonusBoxPrize: mocks.prize } }))
vi.mock('@/lib/auth/guard', () => ({ requireAdmin: mocks.requireAdmin, withAuth: (handler: unknown) => handler }))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: async () => true }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: async () => undefined }))

import { POST } from './route'
import { PATCH } from './[id]/route'

const squad = '12345678-1234-4234-8234-123456789012'
const reward = { title: 'Белые списки на неделю', type: 'WHITELIST_DAYS', value: 7, weight: 15, internalSquads: [squad] }
function request(body: unknown) {
  return new Request('https://cabinet.test/api/admin/bonus-box/prizes', { method: 'POST', body: JSON.stringify(body) })
}
const context = { params: Promise.resolve({ id: 'prize-1' }) }

describe('whitelist reward administration', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.prize.findUnique.mockResolvedValue(reward)
    mocks.prize.create.mockResolvedValue({ id: 'prize-1', ...reward })
    mocks.prize.update.mockResolvedValue({ id: 'prize-1', ...reward })
  })

  it('saves duration, weight and deduplicated selected squads', async () => {
    const response = await POST(request({ ...reward, internalSquads: [squad, squad] }))
    expect(response.status).toBe(200)
    expect(mocks.requireAdmin).toHaveBeenCalledOnce()
    expect(mocks.prize.create).toHaveBeenCalledWith({ data: expect.objectContaining(reward) })
  })

  it.each([{ internalSquads: [] }, { internalSquads: ['not-a-uuid'] }])('rejects invalid squad selection: %j', async ({ internalSquads }) => {
    expect((await POST(request({ ...reward, internalSquads }))).status).toBe(400)
    expect(mocks.prize.create).not.toHaveBeenCalled()
  })

  it('retains selected squads when only the weight changes', async () => {
    expect((await PATCH(request({ weight: 30 }), context)).status).toBe(200)
    expect(mocks.prize.update).toHaveBeenCalledWith({ where: { id: 'prize-1' }, data: { weight: 30 } })
  })

  it('rejects clearing squads or changing an unconfigured prize to whitelist', async () => {
    expect((await PATCH(request({ internalSquads: [] }), context)).status).toBe(400)
    mocks.prize.findUnique.mockResolvedValue({ ...reward, type: 'TRAFFIC_GB', internalSquads: [] })
    expect((await PATCH(request({ type: 'WHITELIST_DAYS' }), context)).status).toBe(400)
    expect(mocks.prize.update).not.toHaveBeenCalled()
  })

  it('rejects zero duration on a partial update', async () => {
    expect((await PATCH(request({ value: 0 }), context)).status).toBe(400)
    expect(mocks.prize.update).not.toHaveBeenCalled()
  })
})
