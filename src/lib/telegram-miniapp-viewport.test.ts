import { describe, expect, it, vi } from 'vitest'
import {
  applyTelegramColorScheme,
  cssColorToHex,
  markTelegramMiniApp,
  prepareTelegramMiniApp,
  syncTelegramMiniAppColors,
  syncTelegramMiniAppInsets,
} from './telegram-miniapp-viewport'

function themeRoot() {
  const classes = new Set<string>()
  return {
    classes,
    dataset: {} as { themeSource?: string },
    classList: {
      toggle: (token: string, force?: boolean) => {
        if (force) classes.add(token)
        else classes.delete(token)
      },
    },
  }
}

describe('applyTelegramColorScheme', () => {
  it('follows the Telegram theme instead of the phone theme', () => {
    const root = themeRoot()

    expect(applyTelegramColorScheme(root, 'dark')).toBe('dark')
    expect(root.classes.has('dark')).toBe(true)
    expect(root.dataset.themeSource).toBe('telegram')

    expect(applyTelegramColorScheme(root, 'light')).toBe('light')
    expect(root.classes.has('dark')).toBe(false)
  })

  it('leaves the page theme alone when Telegram does not report a scheme', () => {
    const root = themeRoot()
    root.classes.add('dark')

    expect(applyTelegramColorScheme(root, undefined)).toBeNull()
    expect(root.classes.has('dark')).toBe(true)
    expect(root.dataset.themeSource).toBeUndefined()
  })
})

describe('cssColorToHex', () => {
  it('converts computed colors to the #rrggbb format Telegram accepts', () => {
    expect(cssColorToHex('rgb(12, 10, 20)')).toBe('#0c0a14')
    expect(cssColorToHex('rgba(247, 246, 251, 1)')).toBe('#f7f6fb')
    expect(cssColorToHex('rgb(12 10 20)')).toBe('#0c0a14')
    expect(cssColorToHex('#FFF')).toBe('#ffffff')
    expect(cssColorToHex('#0c0a14')).toBe('#0c0a14')
  })

  it('rejects transparent and unknown colors', () => {
    expect(cssColorToHex('rgba(0, 0, 0, 0)')).toBeNull()
    expect(cssColorToHex('rgb(12 10 20 / 50%)')).toBeNull()
    expect(cssColorToHex('transparent')).toBeNull()
    expect(cssColorToHex('rgb(300, 0, 0)')).toBeNull()
    expect(cssColorToHex('')).toBeNull()
  })
})

describe('syncTelegramMiniAppColors', () => {
  it('paints the Telegram header, background and bottom bar with the cabinet background', () => {
    const setHeaderColor = vi.fn()
    const setBackgroundColor = vi.fn()
    const setBottomBarColor = vi.fn()

    syncTelegramMiniAppColors(
      { isVersionAtLeast: () => true, setHeaderColor, setBackgroundColor, setBottomBarColor },
      '#0c0a14',
    )

    expect(setHeaderColor).toHaveBeenCalledWith('#0c0a14')
    expect(setBackgroundColor).toHaveBeenCalledWith('#0c0a14')
    expect(setBottomBarColor).toHaveBeenCalledWith('#0c0a14')
  })

  it('skips methods the client version does not support and survives client errors', () => {
    const setHeaderColor = vi.fn(() => {
      throw new Error('WebAppHeaderColorInvalid')
    })
    const setBackgroundColor = vi.fn()
    const setBottomBarColor = vi.fn()

    expect(() =>
      syncTelegramMiniAppColors(
        {
          isVersionAtLeast: (version) => version !== '7.10',
          setHeaderColor,
          setBackgroundColor,
          setBottomBarColor,
        },
        '#f7f6fb',
      ),
    ).not.toThrow()
    expect(setBackgroundColor).toHaveBeenCalledWith('#f7f6fb')
    expect(setBottomBarColor).not.toHaveBeenCalled()
  })

  it('does nothing without a color', () => {
    const setHeaderColor = vi.fn()
    syncTelegramMiniAppColors({ isVersionAtLeast: () => true, setHeaderColor }, null)
    expect(setHeaderColor).not.toHaveBeenCalled()
  })
})

describe('markTelegramMiniApp', () => {
  it('marks the document so Telegram-only spacing can be applied', () => {
    const root: { dataset: { telegramMiniApp?: string } } = { dataset: {} }

    markTelegramMiniApp(root)

    expect(root.dataset.telegramMiniApp).toBe('true')
  })
})

describe('prepareTelegramMiniApp', () => {
  it('opens supported mobile Telegram clients in fullscreen', () => {
    const calls: string[] = []

    prepareTelegramMiniApp({
      platform: 'ios',
      colorScheme: 'dark',
      isVersionAtLeast: vi.fn(() => true),
      ready: vi.fn(() => calls.push('ready')),
      expand: vi.fn(() => calls.push('expand')),
      disableVerticalSwipes: vi.fn(() => calls.push('disableVerticalSwipes')),
      setHeaderColor: vi.fn((color) => calls.push(`setHeaderColor:${color}`)),
      requestFullscreen: vi.fn(() => calls.push('requestFullscreen')),
    })

    expect(calls).toEqual([
      'ready',
      'expand',
      'disableVerticalSwipes',
      'requestFullscreen',
    ])
  })

  it('does not request fullscreen on desktop Telegram', () => {
    const requestFullscreen = vi.fn()

    prepareTelegramMiniApp({
      platform: 'tdesktop',
      isVersionAtLeast: vi.fn(() => true),
      requestFullscreen,
    })

    expect(requestFullscreen).not.toHaveBeenCalled()
  })

  it('remains compatible when an old client SDK exposes unsupported methods', () => {
    const disableVerticalSwipes = vi.fn(() => {
      throw new Error('WebAppMethodUnsupported')
    })
    const requestFullscreen = vi.fn(() => {
      throw new Error('WebAppMethodUnsupported')
    })

    expect(() =>
      prepareTelegramMiniApp({
        platform: 'android',
        isVersionAtLeast: vi.fn(() => false),
        disableVerticalSwipes,
        requestFullscreen,
      }),
    ).not.toThrow()
    expect(disableVerticalSwipes).not.toHaveBeenCalled()
    expect(requestFullscreen).not.toHaveBeenCalled()
  })

  it('does not request fullscreen again when it is already active', () => {
    const requestFullscreen = vi.fn()

    prepareTelegramMiniApp({
      platform: 'android',
      isFullscreen: true,
      isVersionAtLeast: vi.fn(() => true),
      requestFullscreen,
    })

    expect(requestFullscreen).not.toHaveBeenCalled()
  })
})

describe('syncTelegramMiniAppInsets', () => {
  it('publishes Telegram safe-area and content-safe-area values as CSS variables', () => {
    const variables = new Map<string, string>()

    syncTelegramMiniAppInsets(
      {
        safeAreaInset: { top: 47, bottom: 34, left: 0, right: 0 },
        contentSafeAreaInset: { top: 54, bottom: 0, left: 0, right: 0 },
      },
      { setProperty: (property, value) => variables.set(property, value) },
    )

    expect(Object.fromEntries(variables)).toEqual({
      '--tg-safe-area-inset-top': '47px',
      '--tg-safe-area-inset-bottom': '34px',
      '--tg-safe-area-inset-left': '0px',
      '--tg-safe-area-inset-right': '0px',
      '--tg-content-safe-area-inset-top': '54px',
      '--tg-content-safe-area-inset-bottom': '0px',
      '--tg-content-safe-area-inset-left': '0px',
      '--tg-content-safe-area-inset-right': '0px',
    })
  })

  it('ignores missing and invalid inset values', () => {
    const setProperty = vi.fn()

    syncTelegramMiniAppInsets(
      {
        safeAreaInset: { top: Number.NaN, bottom: -1 },
      },
      { setProperty },
    )

    expect(setProperty).not.toHaveBeenCalled()
  })
})
