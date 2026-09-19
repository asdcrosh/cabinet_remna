import { describe, expect, it } from 'vitest'
import { DEFAULT_SUPPORT_QUICK_REPLIES, normalizeSupportSettings } from './support-settings'

describe('support settings', () => {
  it('uses safe defaults for missing values', () => {
    expect(normalizeSupportSettings({})).toEqual({
      slaWarningMinutes: 240,
      slaBreachMinutes: 1440,
      quickReplies: DEFAULT_SUPPORT_QUICK_REPLIES,
    })
  })

  it('normalizes templates and keeps breach after warning', () => {
    expect(normalizeSupportSettings({
      slaWarningMinutes: 60,
      slaBreachMinutes: 30,
      quickReplies: [' Ответ ', 'Ответ', '', 10],
    })).toEqual({
      slaWarningMinutes: 60,
      slaBreachMinutes: 61,
      quickReplies: ['Ответ'],
    })
  })
})
