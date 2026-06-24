import { describe, expect, it } from 'vitest'
import { getTelegramLaunchData } from './telegram-miniapp-client'

describe('Telegram Mini App launch data', () => {
  it('reads init data from Telegram URL hash', () => {
    const initData = 'query_id=test&user=%7B%22id%22%3A1%7D&hash=signature'
    const result = getTelegramLaunchData({
      hash: `#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=8.0&tgWebAppPlatform=tdesktop`,
      search: '',
    })

    expect(result).toEqual({ isTelegram: true, initData })
  })

  it('preserves plus characters in signed init data', () => {
    const initData =
      'user=%7B%22first_name%22%3A%22Artem+VPN%22%7D&auth_date=1782260000&hash=signature'
    const result = getTelegramLaunchData({
      hash: `#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=9.0`,
      search: '',
    })

    expect(result.initData).toBe(initData)
  })

  it('prefers init data exposed by the Telegram SDK', () => {
    const result = getTelegramLaunchData(
      {
        hash: '#tgWebAppData=url-data&tgWebAppVersion=8.0',
        search: '',
      },
      'sdk-data'
    )

    expect(result).toEqual({ isTelegram: true, initData: 'sdk-data' })
  })

  it('recognizes Telegram context while init data is still loading', () => {
    const result = getTelegramLaunchData({
      hash: '#tgWebAppVersion=8.0&tgWebAppPlatform=macos',
      search: '',
    })

    expect(result).toEqual({ isTelegram: true, initData: '' })
  })

  it('keeps standard authentication outside Telegram', () => {
    const result = getTelegramLaunchData({
      hash: '',
      search: '?next=%2Fdashboard',
    })

    expect(result).toEqual({ isTelegram: false, initData: '' })
  })
})
