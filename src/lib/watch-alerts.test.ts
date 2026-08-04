import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  countIncidents: vi.fn(),
  createNotification: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: { watchIncident: { count: mocks.countIncidents } },
}))
vi.mock('./admin-notifications', () => ({ createAdminNotification: mocks.createNotification }))
vi.mock('./branding', () => ({ getBrandName: () => 'Cabinet' }))
vi.mock('./watch-config', () => ({
  getWatchConfig: () => ({
    probeAttempts: 2,
    failureThreshold: 5,
    recoveryThreshold: 5,
    telegramChatId: '100',
  }),
}))
vi.mock('./logger', () => ({ logError: vi.fn(), logWarn: vi.fn() }))

import { groupAlertEvents, sendWatchAlerts, type WatchAlertEvent } from './watch-alerts'

function event(input: Partial<WatchAlertEvent> & Pick<WatchAlertEvent, 'id' | 'kind' | 'type'>): WatchAlertEvent {
  return {
    nodeUuid: 'node-1',
    nodeName: 'London',
    title: 'Проблема',
    message: 'Нет ответа',
    ...input,
  }
}

beforeEach(() => {
  mocks.countIncidents.mockReset().mockResolvedValue(0)
  mocks.createNotification.mockReset().mockResolvedValue(null)
  process.env.TELEGRAM_BOT_TOKEN = 'token'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN
  vi.unstubAllGlobals()
})

describe('groupAlertEvents', () => {
  it('combines channel failures for one physical node into one alert', () => {
    const groups = groupAlertEvents([
      event({ id: 'api', kind: 'OPEN', type: 'NODE_API' }),
      event({ id: 'xhttp', kind: 'OPEN', type: 'XHTTP' }),
      event({ id: 'tcp', kind: 'OPEN', type: 'REALITY_TCP' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.map((item) => item.id)).toEqual(['api', 'xhttp', 'tcp'])
  })

  it('keeps different nodes and state transitions in separate alerts', () => {
    const groups = groupAlertEvents([
      event({ id: 'open-1', kind: 'OPEN', type: 'XHTTP' }),
      event({ id: 'resolved-1', kind: 'RESOLVED', type: 'XHTTP' }),
      event({ id: 'open-2', kind: 'OPEN', type: 'XHTTP', nodeUuid: 'node-2', nodeName: 'Paris' }),
    ])

    expect(groups).toHaveLength(3)
  })

  it('sends one notification and one Telegram message for three failed channels', async () => {
    await sendWatchAlerts([
      event({ id: 'api', kind: 'OPEN', type: 'NODE_API' }),
      event({ id: 'xhttp', kind: 'OPEN', type: 'XHTTP' }),
      event({ id: 'tcp', kind: 'OPEN', type: 'REALITY_TCP' }),
    ])

    expect(mocks.createNotification).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not send another alert while the same node still has an open incident', async () => {
    mocks.countIncidents.mockResolvedValue(1)

    await sendWatchAlerts([event({ id: 'xhttp', kind: 'OPEN', type: 'XHTTP' })])

    expect(mocks.createNotification).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('waits for every channel to recover before sending the recovery message', async () => {
    mocks.countIncidents.mockResolvedValue(1)

    await sendWatchAlerts([event({ id: 'xhttp', kind: 'RESOLVED', type: 'XHTTP' })])

    expect(mocks.createNotification).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
