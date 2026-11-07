import { describe, expect, it } from 'vitest'
import { buildRabbitHoleLink, extractRabbitHoleSubscription } from './rabbit-hole'

describe('Rabbit Hole subscription import', () => {
  it('uses the documented prefix and preserves the complete subscription URL through the Telegram bridge', () => {
    const subscription = 'https://subscription.example/user/a%2Fb?token=a+b&format=json#VPN'
    const link = buildRabbitHoleLink(subscription)
    expect(link).toBe(`rabbithole://add/${subscription}`)
    const bridge = new URL('https://cabinet.example/open-app')
    bridge.searchParams.set('url', link)
    expect(extractRabbitHoleSubscription(new URL(bridge.toString()).searchParams.get('url')!)).toBe(subscription)
  })

  it.each(['', 'javascript:alert(1)', 'file:///etc/passwd', 'https://user:password@example.com/sub'])('rejects unsafe subscription input %s', (value) => {
    expect(buildRabbitHoleLink(value)).toBe('')
    expect(extractRabbitHoleSubscription(`rabbithole://add/${value}`)).toBe('')
  })

  it('rejects unsupported Rabbit Hole actions', () => {
    expect(extractRabbitHoleSubscription('rabbithole://delete/https://example.com')).toBe('')
  })
})
