import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PageLoading } from './page-loading'
import { Switch } from './switch'
import { SystemState } from './system-state'
import { Checkbox } from './checkbox'

describe('общие состояния интерфейса', () => {
  it('рендерит доступный переключатель с подписью и описанием', () => {
    const html = renderToStaticMarkup(
      <Switch
        checked
        onCheckedChange={vi.fn()}
        label="Показывать оффер"
        description="Виден подходящим пользователям"
      />,
    )

    expect(html).toContain('role="switch"')
    expect(html).toContain('checked=""')
    expect(html).toContain('Показывать оффер')
    expect(html).toContain('Виден подходящим пользователям')
  })

  it('рендерит настоящий checkbox с общей визуальной оболочкой', () => {
    const html = renderToStaticMarkup(
      <Checkbox checked readOnly label="Выбрать промокод" />,
    )

    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked=""')
    expect(html).toContain('Выбрать промокод')
  })

  it('сообщает скринридеру о загрузке страницы', () => {
    const html = renderToStaticMarkup(<PageLoading label="Загрузка тарифов" rows={2} split />)

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Загрузка тарифов')
  })

  it('использует alert для критического состояния', () => {
    const html = renderToStaticMarkup(
      <SystemState
        tone="danger"
        title="Не удалось загрузить"
        description="Повторите запрос"
        reference="digest-123"
      />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('Не удалось загрузить')
    expect(html).toContain('Код ошибки: digest-123')
  })
})
