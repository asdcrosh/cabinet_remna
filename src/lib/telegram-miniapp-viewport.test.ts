import { describe, expect, it, vi } from 'vitest'
import {
  markTelegramMiniApp,
  prepareTelegramMiniApp,
  syncTelegramMiniAppInsets,
} from './telegram-miniapp-viewport'

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
      'setHeaderColor:#0a0c0d',
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
