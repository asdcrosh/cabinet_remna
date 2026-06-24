interface TelegramLaunchLocation {
  hash: string
  search: string
}

export interface TelegramLaunchData {
  isTelegram: boolean
  initData: string
}

function readParams(value: string) {
  return new URLSearchParams(value.replace(/^[?#]/, ''))
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
  const hashParams = readParams(location.hash)
  const searchParams = readParams(location.search)
  const launchParams = [hashParams, searchParams]
  const urlInitData =
    readRawParam(location.hash, 'tgWebAppData') || readRawParam(location.search, 'tgWebAppData')
  const isTelegram =
    Boolean(sdkInitData || urlInitData) ||
    launchParams.some(
      (params) =>
        params.has('tgWebAppVersion') ||
        params.has('tgWebAppPlatform') ||
        params.has('tgWebAppThemeParams')
    )

  return {
    isTelegram,
    initData: sdkInitData || urlInitData,
  }
}
