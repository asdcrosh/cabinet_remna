interface TelegramLaunchLocation {
  hash: string
  search: string
}

export interface TelegramLaunchData {
  isTelegram: boolean
  initData: string
}

let sdkReady: Promise<void> | undefined

export function loadTelegramMiniAppSdk(): Promise<void> {
  if (window.Telegram?.WebApp?.openInvoice) return Promise.resolve()
  if (sdkReady) return sdkReady

  sdkReady = new Promise(resolve => {
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-web-app.js?65'
    script.async = true

    const finish = () => {
      window.clearTimeout(timeout)
      resolve()
    }
    const timeout = window.setTimeout(finish, 4000)
    script.addEventListener('load', () => {
      window.dispatchEvent(new Event('telegram-web-app-ready'))
      finish()
    }, { once: true })
    script.addEventListener('error', finish, { once: true })
    document.head.appendChild(script)
  })

  return sdkReady
}

export function telegramStarsInvoiceUrl(value: string) {
  return /^https:\/\/t\.me\/(?:\$|invoice\/)[A-Za-z0-9_=-]+$/.test(value) ? value : null
}

function readRawParam(value: string, key: string) {
  const source = value.replace(/^[?#]/, '')
  const prefix = `${key}=`
  const encodedValue = source
    .split('&')
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)

  if (!encodedValue) return ''

  try {
    // Telegram signs the exact decoded initData string. URLSearchParams would
    // convert literal "+" characters to spaces and invalidate the signature.
    return decodeURIComponent(encodedValue)
  } catch {
    return ''
  }
}

export function getTelegramLaunchData(
  location: TelegramLaunchLocation,
  sdkInitData = ''
): TelegramLaunchData {
  const urlInitData =
    readRawParam(location.hash, 'tgWebAppData') || readRawParam(location.search, 'tgWebAppData')
  const initData = sdkInitData || urlInitData

  return {
    isTelegram: Boolean(initData),
    initData,
  }
}
