import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rateLimit: vi.fn(), getAppRelease: vi.fn() }))

vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/mobile-app-release', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mobile-app-release')>()),
  getAppRelease: mocks.getAppRelease,
}))

import { GET } from './route'

const release = {
  version: '1.2.0',
  build: 5,
  minBuild: 3,
  notes: '',
  files: {
    'arm64-v8a': { file: 'stealthnet-1.2.0-arm64-v8a.apk', sha256: 'a'.repeat(64), size: 100 },
    'armeabi-v7a': { file: 'stealthnet-1.2.0-armeabi-v7a.apk', sha256: 'b'.repeat(64), size: 90 },
  },
}

const get = (q = '') => GET(new Request(`https://lk.example/api/mobile/app-version${q}`))

describe('GET /api/mobile/app-version', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.getAppRelease.mockResolvedValue(release)
  })

  it('выпуск под архитектуру, по умолчанию arm64', async () => {
    let res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({
      version: '1.2.0', build: 5, minBuild: 3, notes: '', abi: 'arm64-v8a',
      url: '/download/android/arm64-v8a', sha256: 'a'.repeat(64), size: 100,
    })
    res = await get('?abi=armeabi-v7a')
    expect(await res.json()).toMatchObject({ abi: 'armeabi-v7a', sha256: 'b'.repeat(64) })
  })

  it('ошибки: неизвестная архитектура, нет сборки, нет выпуска, лимит', async () => {
    expect((await get('?abi=mips')).status).toBe(400)
    expect(await (await get('?abi=x86_64')).json()).toEqual({ error: 'NO_BUILD_FOR_ABI' })
    mocks.getAppRelease.mockResolvedValue(null)
    expect(await (await get()).json()).toEqual({ error: 'NO_RELEASE' })
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 9 })
    const res = await get()
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('9')
  })
})
