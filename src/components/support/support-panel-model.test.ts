import { describe, expect, it } from 'vitest'
import { appendReturnTo, buildAdminSupportPath, formatSupportTicketAge, getSupportSlaState, sanitizeAdminSupportReturnPath } from './support-panel-model'

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
