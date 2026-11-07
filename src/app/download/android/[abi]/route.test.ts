import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rateLimit: vi.fn(), open: vi.fn() }))

vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/mobile-app-release', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mobile-app-release')>()),
  openAppReleaseFile: mocks.open,
}))

import { GET as byAbi } from './route'
import { GET as latest } from '../route'
import { GET as named } from '../../StealthNet.apk/route'
import { GET as named32 } from '../../StealthNet-32bit.apk/route'

const req = (p: string) => new Request(`https://lk.example${p}`)
const ctx = (abi: string) => ({ params: Promise.resolve({ abi }) })

describe('GET /download/android', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.open.mockImplementation(async (abi: string) => ({
      manifest: { version: '1.2.0' },
      entry: { file: `stealthnet-1.2.0-${abi}.apk`, sha256: 'c'.repeat(64), size: 3 },
      body: new Response(new Uint8Array([1, 2, 3])).body,
    }))
  })

  it('отдаёт APK с заголовками скачивания, по умолчанию arm64', async () => {
    const res = await latest(req('/download/android'))
    expect(res.status).toBe(200)
    expect(mocks.open).toHaveBeenCalledWith('arm64-v8a')
    expect(res.headers.get('content-type')).toBe('application/vnd.android.package-archive')
    expect(res.headers.get('content-length')).toBe('3')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="StealthNet-1.2.0.apk"')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('архитектура из адреса; неизвестная — 404; нет файла — 404; лимит — 429', async () => {
    await byAbi(req('/download/android/armeabi-v7a'), ctx('armeabi-v7a'))
    expect(mocks.open).toHaveBeenCalledWith('armeabi-v7a')
    expect((await byAbi(req('/download/android/mips'), ctx('mips'))).status).toBe(404)
    mocks.open.mockResolvedValue(null)
    expect((await latest(req('/download/android'))).status).toBe(404)
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 60 })
    expect((await latest(req('/download/android'))).status).toBe(429)
  })

  it('понятные адреса для людей: StealthNet.apk и StealthNet-32bit.apk', async () => {
    const main = await named(req('/download/StealthNet.apk'))
    expect(mocks.open).toHaveBeenLastCalledWith('arm64-v8a')
    expect(main.headers.get('content-disposition')).toBe('attachment; filename="StealthNet-1.2.0.apk"')
    const legacy = await named32(req('/download/StealthNet-32bit.apk'))
    expect(mocks.open).toHaveBeenLastCalledWith('armeabi-v7a')
    expect(legacy.headers.get('content-disposition')).toBe('attachment; filename="StealthNet-1.2.0-32bit.apk"')
  })
})
