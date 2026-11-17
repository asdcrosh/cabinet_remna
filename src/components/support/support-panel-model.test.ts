import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appendReturnTo,
  buildAdminSupportPath,
  formatSupportTicketAge,
  getSupportDraftKey,
  getSupportSlaState,
  readSupportDraft,
  sanitizeAdminSupportReturnPath,
  saveSupportDraft,
  type SupportDraftStorage,
} from './support-panel-model'

describe('admin support navigation', () => {
  it('preserves queue filters and selected ticket in the return path', () => {
    expect(buildAdminSupportPath({
      folder: 'need-answer',
      assigneeScope: 'mine',
      query: ' user@example.com ',
      ticketId: 'ticket-1',
    })).toBe('/dashboard/admin/support?folder=need-answer&assignee=mine&q=user%40example.com&ticket=ticket-1')
  })

  it('accepts only the admin support page as a return target', () => {
    expect(sanitizeAdminSupportReturnPath('/dashboard/admin/support?ticket=ticket-1')).toBe('/dashboard/admin/support?ticket=ticket-1')
    expect(sanitizeAdminSupportReturnPath('/dashboard/admin/support-archive')).toBe('')
    expect(sanitizeAdminSupportReturnPath('https://example.com/dashboard/admin/support')).toBe('')
  })

  it('adds an encoded return target without losing the destination query', () => {
    expect(appendReturnTo('/dashboard/admin/users?q=user%40example.com', '/dashboard/admin/support?ticket=ticket-1'))
      .toBe('/dashboard/admin/users?q=user%40example.com&returnTo=%2Fdashboard%2Fadmin%2Fsupport%3Fticket%3Dticket-1')
  })
})

describe('support SLA', () => {
  const now = Date.parse('2026-09-19T12:00:00.000Z')

  it('distinguishes normal, warning and breached waiting time', () => {
    expect(getSupportSlaState('2026-09-19T11:30:00.000Z', 60, 120, now).state).toBe('ok')
    expect(getSupportSlaState('2026-09-19T10:30:00.000Z', 60, 120, now).state).toBe('warning')
    expect(getSupportSlaState('2026-09-19T09:30:00.000Z', 60, 120, now).state).toBe('breached')
  })

  it('formats ticket age independently from SLA', () => {
    expect(formatSupportTicketAge('2026-09-17T12:00:00.000Z', now)).toBe('2 дн')
  })
})

describe('support reply drafts', () => {
  function createStorage(): SupportDraftStorage & { items: Map<string, string> } {
    const items = new Map<string, string>()
    return {
      items,
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => { items.set(key, value) },
      removeItem: (key) => { items.delete(key) },
    }
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps drafts apart per mode and ticket', () => {
    expect(getSupportDraftKey('admin', 'ticket-1')).toBe('support-draft:admin:ticket-1')
    expect(getSupportDraftKey('admin', 'ticket-1')).not.toBe(getSupportDraftKey('user', 'ticket-1'))
    expect(getSupportDraftKey('admin', 'ticket-1')).not.toBe(getSupportDraftKey('admin', 'ticket-2'))
  })

  it('stores the draft at once so switching tickets right after typing keeps it', () => {
    vi.useFakeTimers()
    const storage = createStorage()
    const closedTicketKey = getSupportDraftKey('admin', 'ticket-1')

    saveSupportDraft(storage, closedTicketKey, 'Черновик ответа')
    // Смена статуса сразу открывает другое обращение — таймеры не должны успеть сработать.
    expect(readSupportDraft(storage, getSupportDraftKey('admin', 'ticket-2'))).toBe('')
    expect(readSupportDraft(storage, closedTicketKey)).toBe('Черновик ответа')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drops a blank draft instead of storing whitespace', () => {
    const storage = createStorage()
    const key = getSupportDraftKey('user', 'ticket-1')

    saveSupportDraft(storage, key, 'Текст')
    saveSupportDraft(storage, key, '   ')
    expect(storage.items.has(key)).toBe(false)
    expect(readSupportDraft(storage, key)).toBe('')
  })

  it('does not break typing when storage is unavailable', () => {
    const storage: SupportDraftStorage = {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => { throw new Error('SecurityError') },
    }
    const key = getSupportDraftKey('admin', 'ticket-1')

    expect(() => saveSupportDraft(storage, key, 'Текст')).not.toThrow()
    expect(() => saveSupportDraft(storage, key, '')).not.toThrow()
    expect(readSupportDraft(storage, key)).toBe('')
  })
})
