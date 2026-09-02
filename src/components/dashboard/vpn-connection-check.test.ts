import { describe, expect, it } from 'vitest'
import { buildConnectionResult } from './vpn-connection-check'

const now = new Date('2026-08-19T12:00:00.000Z')

describe('buildConnectionResult', () => {
  it('подтверждает рабочий маршрут через сервер', () => {
    const result = buildConnectionResult({
      subscription: { status: 'ACTIVE' },
      devices: [{ hwid: 'device-1' }],
      vpn: {
        status: 'vpn',
        publicIp: '203.0.113.10',
        node: { name: 'NL-01', country: 'Нидерланды' },
      },
      deviceLimit: 5,
      now,
    })

    expect(result.tone).toBe('success')
    expect(result.title).toBe('Подключение работает')
    expect(result.checks.every((check) => check.state === 'ok')).toBe(true)
  })

  it('ведёт к подключению, если кабинет открыт напрямую', () => {
    const result = buildConnectionResult({
      subscription: { status: 'ACTIVE' },
      devices: [],
      vpn: { status: 'direct', publicIp: '203.0.113.20' },
      deviceLimit: 5,
      now,
    })

    expect(result.tone).toBe('warning')
    expect(result.action).toBe('connection')
  })

  it('предлагает освободить место при заполненном лимите', () => {
    const result = buildConnectionResult({
      subscription: { status: 'ACTIVE' },
      devices: [{ hwid: '1' }, { hwid: '2' }],
      vpn: { status: 'vpn', node: { name: 'FI-01', country: 'Финляндия' } },
      deviceLimit: 2,
      now,
    })

    expect(result.action).toBe('devices')
    expect(result.title).toContain('места')
  })
})
