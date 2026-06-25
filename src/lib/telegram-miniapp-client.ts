interface TelegramLaunchLocation {
  hash: string
  search: string
}

export interface TelegramLaunchData {
  isTelegram: boolean
  initData: string
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
