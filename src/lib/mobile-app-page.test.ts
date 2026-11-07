import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatMegabytes, getAndroidDownloadInfo, isAndroidUserAgent, isMobileAppPromoEnabled } from './mobile-app-page'

const sha = 'a'.repeat(64)
let dir: string | null = null

async function releaseDir(files: Record<string, unknown>) {
  dir = await mkdtemp(path.join(tmpdir(), 'app-page-'))
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ version: '1.0.2', build: 3, files }))
  return dir
}

afterEach(async () => {
  vi.unstubAllEnvs()
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = null
})

describe('страница скачивания приложения', () => {
  it('берёт версию, размер arm64 и ссылку для 32-битных телефонов', async () => {
    const d = await releaseDir({
      'arm64-v8a': { file: 'stealthnet-1.0.2-arm64-v8a.apk', sha256: sha, size: 20_697_674 },
      'armeabi-v7a': { file: 'stealthnet-1.0.2-armeabi-v7a.apk', sha256: sha, size: 20_783_860 },
    })
    await expect(getAndroidDownloadInfo(d)).resolves.toEqual({
      version: '1.0.2',
      sizeLabel: '20 МБ',
      url: '/download/StealthNet.apk',
      legacyUrl: '/download/StealthNet-32bit.apk',
    })
  })

  it('без 32-битного APK не показывает запасную ссылку, без arm64 — выпуска нет', async () => {
    const d = await releaseDir({ 'arm64-v8a': { file: 'stealthnet-1.0.2-arm64-v8a.apk', sha256: sha, size: 1000 } })
    expect((await getAndroidDownloadInfo(d))?.legacyUrl).toBeNull()
    await rm(d, { recursive: true, force: true })
    const other = await releaseDir({ x86_64: { file: 'stealthnet-1.0.2-x86_64.apk', sha256: sha, size: 1000 } })
    await expect(getAndroidDownloadInfo(other)).resolves.toBeNull()
  })

  it('размер в мегабайтах не меньше 1', () => {
    expect(formatMegabytes(1000)).toBe('1 МБ')
    expect(formatMegabytes(21_892_111)).toBe('21 МБ')
  })

  it('узнаёт Android по User-Agent', () => {
    expect(isAndroidUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 8) Chrome/130')).toBe(true)
    expect(isAndroidUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false)
    expect(isAndroidUserAgent(null)).toBe(false)
  })

  it('кнопка в кабинете выключена, пока не задан MOBILE_APP_PROMO', () => {
    expect(isMobileAppPromoEnabled()).toBe(false)
    vi.stubEnv('MOBILE_APP_PROMO', 'true')
    expect(isMobileAppPromoEnabled()).toBe(true)
  })
})
