import { describe, expect, it } from 'vitest'
import { isTopDialogLayer, registerDialogLayer } from './dialog-stack'

describe('dialog stack', () => {
  it('keeps only the latest layer active', () => {
    const editor = Symbol('editor')
    const confirmation = Symbol('confirmation')
    const unregisterEditor = registerDialogLayer(editor)
    const unregisterConfirmation = registerDialogLayer(confirmation)

    expect(isTopDialogLayer(editor)).toBe(false)
    expect(isTopDialogLayer(confirmation)).toBe(true)

    unregisterConfirmation()
    expect(isTopDialogLayer(editor)).toBe(true)
    unregisterEditor()
  })

  it('removes a closed background layer without affecting the top layer', () => {
    const background = Symbol('background')
    const foreground = Symbol('foreground')
    const unregisterBackground = registerDialogLayer(background)
    const unregisterForeground = registerDialogLayer(foreground)

    unregisterBackground()
    expect(isTopDialogLayer(foreground)).toBe(true)
    unregisterForeground()
  })
})
