import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OAuthReturnPage from './page'

const requestHeaders = vi.hoisted(() => new Headers())
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }))

describe('запасной возврат в StealthNet после входа', () => {
  afterEach(() => {
    requestHeaders.delete('user-agent')
    vi.unstubAllEnvs()
  })

  it('на Android открывает именно пакет кабинета, даже если есть QA-сборка', async () => {
    requestHeaders.set('user-agent', 'Mozilla/5.0 (Linux; Android 15)')
    vi.stubEnv('MOBILE_ANDROID_PACKAGE', 'site.stealthnet.app')
    const code = 'valid-one-time-test-code'
    const page = await OAuthReturnPage({ searchParams: Promise.resolve({ code }) })
    const html = renderToStaticMarkup(page)

    expect(html).toContain(`href="intent://oauth?code=${code}#Intent;scheme=stealthnet;package=site.stealthnet.app;end"`)
  })

  it('сохраняет прежнюю ссылку в браузере без Android', async () => {
    requestHeaders.set('user-agent', 'Mozilla/5.0 (Macintosh)')
    const page = await OAuthReturnPage({ searchParams: Promise.resolve({ error: 'expired' }) })

    expect(renderToStaticMarkup(page)).toContain('href="stealthnet://oauth?error=expired"')
  })
})
