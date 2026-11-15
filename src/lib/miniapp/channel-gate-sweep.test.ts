import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findManyUsers: vi.fn(), gate: vi.fn(), showScreen: vi.fn(), feature: vi.fn(), campaign: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findMany: mocks.findManyUsers } } }))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: mocks.feature }))
vi.mock('./channel-referrals', () => ({ channelCampaign: mocks.campaign, channelGate: mocks.gate }))
vi.mock('./rich-screens', () => ({ buildChannelGateScreen: vi.fn((url: string) => `<gate>${url}</gate>`) }))
vi.mock('./callback-screen', () => ({ showBotScreen: mocks.showScreen }))

import { runChannelGateSweep } from './channel-gate-sweep'

describe('Периодическая проверка обязательной подписки на канал', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.campaign.mockReturnValue({ channelUrl: 'https://t.me/alekseevVP_Official' })
    mocks.feature.mockResolvedValue(true)
    mocks.findManyUsers.mockResolvedValue([])
    mocks.gate.mockResolvedValue(null)
    mocks.showScreen.mockResolvedValue(1)
  })

  it('не трогает пользователей, когда кампания выключена', async () => {
    mocks.campaign.mockReturnValue(null)
    await runChannelGateSweep()
    expect(mocks.findManyUsers).not.toHaveBeenCalled()
  })

  it('показывает экран подписки вышедшему из канала пользователю', async () => {
    mocks.findManyUsers.mockResolvedValue([{ telegramId: BigInt(111) }, { telegramId: BigInt(222) }])
    mocks.gate.mockImplementation(async (id: number) =>
      id === 222 ? { channelUrl: 'https://t.me/alekseevVP_Official', claimable: false } : null)

    const result = await runChannelGateSweep()

    expect(result).toEqual({ checked: 2, gated: 1 })
    expect(mocks.gate).toHaveBeenCalledWith(222, { fresh: true })
    expect(mocks.showScreen).toHaveBeenCalledTimes(1)
    expect(mocks.showScreen).toHaveBeenCalledWith(222, '<gate>https://t.me/alekseevVP_Official</gate>')
  })

  it('ошибка показа экрана не роняет проход', async () => {
    mocks.findManyUsers.mockResolvedValue([{ telegramId: BigInt(111) }])
    mocks.gate.mockResolvedValue({ channelUrl: 'https://t.me/alekseevVP_Official', claimable: false })
    mocks.showScreen.mockRejectedValue(new Error('chat not found'))

    await expect(runChannelGateSweep()).resolves.toEqual({ checked: 1, gated: 1 })
  })
})
