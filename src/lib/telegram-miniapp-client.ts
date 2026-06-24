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

export function getTelegramLaunchData(
  location: TelegramLaunchLocation,
  sdkInitData = ''
): TelegramLaunchData {
  const hashParams = readParams(location.hash)
  const searchParams = readParams(location.search)
  const launchParams = [hashParams, searchParams]
  const urlInitData =
    launchParams.map((params) => params.get('tgWebAppData')).find((value): value is string => Boolean(value)) ?? ''
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
