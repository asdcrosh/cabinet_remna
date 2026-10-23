import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() }, subscription: { findMany: vi.fn(), update: vi.fn() },
  payment: { findFirst: vi.fn() }, getUser: vi.fn(), updateUser: vi.fn(), sync: vi.fn(), providers: vi.fn(),
}))
vi.mock('./prisma', () => ({ prisma: mocks }))
vi.mock('./remnashop-users', () => ({ syncRemnashopUserBySourceId: mocks.sync }))
vi.mock('./payment-providers', () => ({ getAvailablePaymentProviders: mocks.providers }))
vi.mock('./remnawave', () => ({
  remnawave: { getUser: mocks.getUser, updateUser: mocks.updateUser },
  remnawaveUserReference: (user: any) => user.remnawaveId ? { id: user.remnawaveId } : { uuid: user.remnawaveUuid },
  hasRemnawaveUserReference: (user: any) => Boolean(user.remnawaveId || user.remnawaveUuid),
}))
import { getBotWhitelistOffer, resolveBotUser, syncBotWhitelistSquads } from './bot-whitelist'

const user = { id: 'user', remnashopUserId: 7, telegramId: 123n, remnawaveUuid: 'remote' } as any
function row(overrides = {}) {
  return {
    id: 'sub', status: 'ACTIVE', expireAt: new Date(Date.now() + 86400_000),
    whitelistAddonActive: false, whitelistAddonInternalSquads: [], whitelistAddonExpireAt: null,
    whitelistAddonRemainingSeconds: null,
    plan: { id: 'plan', isPromo: true, activeInternalSquads: ['base'], whitelistAddonEnabled: true, whitelistAddonPriceKopecks: 24900, whitelistAddonInternalSquads: ['addon'] },
    ...overrides,
  }
}
describe('Cabinet authority for bot add-ons', () => {
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T00:00:00Z'))
    vi.resetAllMocks()
    mocks.subscription.findMany.mockResolvedValue([row()])
    mocks.payment.findFirst.mockResolvedValue(null)
    mocks.providers.mockResolvedValue([{ id: 'YOOKASSA', label: 'ЮKassa' }, { id: 'PAYANYWAY', label: 'PayAnyWay' }])
    mocks.getUser.mockResolvedValue({ response: { status: 'ACTIVE', expireAt: new Date(Date.now() + 86400_000).toISOString(), activeInternalSquads: [{ uuid: 'base' }, { uuid: 'manual' }] } })
    mocks.user.findUnique.mockResolvedValue(user)
  })
  it('offers the exact Cabinet price for a trial without email and excludes email-only checkout', async () => {
    const offer = await getBotWhitelistOffer(user)
    expect(offer).toMatchObject({ available: true, priceKopecks: 24900, durationDays: 30, providers: [{ id: 'YOOKASSA', label: 'ЮKassa' }] })
  })
  it.each([
    { status: 'EXPIRED' }, { status: 'PAUSED' }, { status: 'DISABLED' },
    { expireAt: new Date(0) },
    { whitelistAddonActive: true, whitelistAddonExpireAt: new Date(Date.now() + 86400_000) },
    { whitelistAddonRemainingSeconds: 86400n },
    { plan: null },
  ])('does not sell an unavailable or already paid entitlement: %s', async (override) => {
    mocks.subscription.findMany.mockResolvedValue([row(override)])
    expect((await getBotWhitelistOffer(user)).available).toBe(false)
  })
  it('does not sell manually assigned squads or an already paid pending grant', async () => {
    mocks.getUser.mockResolvedValue({ response: { status: 'ACTIVE', expireAt: new Date(Date.now() + 86400_000).toISOString(), activeInternalSquads: [{ uuid: 'addon' }] } })
    expect((await getBotWhitelistOffer(user)).available).toBe(false)
    mocks.payment.findFirst.mockResolvedValue({ id: 'paid' })
    expect((await getBotWhitelistOffer(user)).reason).toContain('Оплата получена')
  })
  it('rejects identity mismatches and failed source synchronization', async () => {
    await expect(resolveBotUser(7, '999')).rejects.toMatchObject({ status: 403 })
    mocks.sync.mockResolvedValue({ found: true, subscriptionAction: 'failed' })
    await expect(resolveBotUser(7, '123', true)).rejects.toMatchObject({ status: 503 })
  })
  it('preserves paid and manual squads on a plan change while replacing the old base', async () => {
    mocks.subscription.findMany.mockResolvedValue([row({ whitelistAddonActive: true, whitelistAddonInternalSquads: ['addon'], whitelistAddonExpireAt: new Date(Date.now() + 86400_000) })])
    await syncBotWhitelistSquads(user, { remnawaveUuid: 'remote', baseSquads: ['new-base'], planSquads: ['new-base'], active: true, expireAt: new Date(Date.now() + 86400_000).toISOString() })
    expect(mocks.updateUser).toHaveBeenCalledWith({ uuid: 'remote' }, { activeInternalSquads: ['manual', 'new-base', 'addon'] })
  })
  it('syncs a v3 numeric profile using Cabinet identity instead of the bot legacy UUID', async () => {
    const v3User = { ...user, remnawaveUuid: null, remnawaveId: 42 }
    expect((await getBotWhitelistOffer(v3User)).available).toBe(true)
    await syncBotWhitelistSquads(v3User, { remnawaveUuid: 'legacy-bot-alias', baseSquads: ['new-base'], planSquads: ['new-base'], active: true, expireAt: new Date(Date.now() + 86400_000).toISOString() })
    expect(mocks.getUser).toHaveBeenLastCalledWith({ id: 42 })
    expect(mocks.updateUser).toHaveBeenCalledWith({ id: 42 }, { activeInternalSquads: ['manual', 'new-base'] })
  })
  it('rejects mismatched UUIDs and missing canonical profiles before changing squads', async () => {
    const input = { remnawaveUuid: 'another-profile', baseSquads: [], planSquads: [], active: true, expireAt: new Date(Date.now() + 86400_000).toISOString() }
    await expect(syncBotWhitelistSquads(user, input)).rejects.toMatchObject({ status: 403 })
    await expect(syncBotWhitelistSquads({ ...user, remnawaveUuid: null }, input)).rejects.toMatchObject({ status: 403 })
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
  it('never resurrects an expired or revoked add-on from a stale bot subscription', async () => {
    mocks.subscription.findMany.mockResolvedValue([row({ whitelistAddonInternalSquads: ['addon'] })])
    await syncBotWhitelistSquads(user, { remnawaveUuid: 'remote', baseSquads: ['base', 'addon'], planSquads: ['base'], active: true, expireAt: new Date(Date.now() + 86400_000).toISOString() })
    expect(mocks.updateUser).toHaveBeenCalledWith({ uuid: 'remote' }, { activeInternalSquads: ['manual', 'base'] })
  })
  it('captures paused time before a bot renewal replaces the main expiration', async () => {
    const mainExpiry = new Date(Date.now() - 5 * 86400_000)
    mocks.subscription.findMany.mockResolvedValue([row({ expireAt: mainExpiry, whitelistAddonActive: true, whitelistAddonInternalSquads: ['addon'], whitelistAddonExpireAt: new Date(mainExpiry.getTime() + 3 * 86400_000) })])
    await syncBotWhitelistSquads(user, { remnawaveUuid: 'remote', baseSquads: ['base'], planSquads: ['base'], active: true, expireAt: new Date(Date.now() + 86400_000).toISOString() })
    expect(mocks.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ whitelistAddonActive: false, whitelistAddonRemainingSeconds: 3n * 86400n }) }))
  })
  it('discards a queued plan update when another renewal has already replaced it', async () => {
    const result = await syncBotWhitelistSquads(user, { remnawaveUuid: 'remote', baseSquads: ['stale-base'], planSquads: ['stale-base'], active: true, expireAt: new Date(0).toISOString() })
    expect(result.stale).toBe(true)
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
})
