// Данные для страницы скачивания приложения StealthNet (/app/android) и кнопки в кабинете.
import { DEFAULT_APP_ABI, getAppRelease } from './mobile-app-release'

export const MOBILE_APP_PAGE_PATH = '/app/android'
// Адреса для людей: в подсказке браузера видно название приложения.
export const ANDROID_APK_PATH = '/download/StealthNet.apk'
export const ANDROID_LEGACY_APK_PATH = '/download/StealthNet-32bit.apk'

export type AndroidDownloadInfo = {
  version: string
  sizeLabel: string
  url: string
  // APK для старых 32-битных телефонов, если он есть в выпуске.
  legacyUrl: string | null
}

/** Текущий выпуск для страницы скачивания или null, если выпуска нет. */
export async function getAndroidDownloadInfo(dir?: string): Promise<AndroidDownloadInfo | null> {
  const release = await getAppRelease(dir)
  const main = release?.files[DEFAULT_APP_ABI]
  if (!release || !main) return null
  return {
    version: release.version,
    sizeLabel: formatMegabytes(main.size),
    url: ANDROID_APK_PATH,
    legacyUrl: release.files['armeabi-v7a'] ? ANDROID_LEGACY_APK_PATH : null,
  }
}

export function formatMegabytes(bytes: number) {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} МБ`
}

export function isAndroidUserAgent(userAgent: string | null | undefined) {
  return /\bAndroid\b/i.test(userAgent ?? '')
}

/** Кнопка «Приложение StealthNet» в кабинете. На время пилота выключена: страницу дают по ссылке. */
export function isMobileAppPromoEnabled() {
  const value = process.env.MOBILE_APP_PROMO?.trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(value ?? '')
}
