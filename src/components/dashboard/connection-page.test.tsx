import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConnectionPage } from './connection-page'
import { VpnConnectionCheck } from './vpn-connection-check'

describe('экран подключения', () => {
  function renderPage(expired = false) {
    return renderToStaticMarkup(
      <ConnectionPage subscriptionUrl="https://example.invalid/subscription" supportEnabled expired={expired}>
        <p>Управление оплатой</p>
      </ConnectionPage>,
    )
  }

  it('начинается с установки, а не с оплаты или диагностики', () => {
    const html = renderPage()
    expect(html).toContain('Установите INCY')
    expect(html).toContain('Уже установлено')
    expect(html).not.toContain('>Добавить в INCY<')
    expect(html).not.toContain('Проверить подключение')
    expect(html.indexOf('id="connection"')).toBeLessThan(html.indexOf('Подписка и оплата'))
    expect(html).not.toMatch(/<details[^>]*\bopen=/)
  })

  it('объясняет подключение другого устройства и ведёт к отдельному списку', () => {
    const html = renderPage()
    expect(html).toContain('Как подключить другое устройство')
    expect(html).toContain('войдите в тот же аккаунт')
    expect(html).toContain('href="/dashboard/devices"')
    expect(html).not.toContain('Подключить ещё')
  })

  it('показывает оплату вместо настройки при истёкшей подписке', () => {
    const html = renderPage(true)
    expect(html).not.toContain('id="connection"')
    expect(html).toMatch(/<details[^>]*\bopen=""/)
    expect(html).toContain('Подписка истекла. Продлите доступ')
    expect(html).toContain('Управление оплатой')
  })

  it('не перегружает последний шаг технической диагностикой', () => {
    const html = renderToStaticMarkup(<VpnConnectionCheck supportEnabled simple />)
    expect(html).toContain('Проверить подключение')
    expect(html).not.toContain('Диагностика подключения')
    expect(html).not.toContain('Подключение работает')
  })
})
