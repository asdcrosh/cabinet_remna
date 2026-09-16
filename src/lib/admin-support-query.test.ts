import { describe, expect, it } from 'vitest'
import {
  buildAdminSupportAssigneeWhere,
  buildAdminSupportFolderWhere,
  buildAdminSupportOrderBy,
  buildAdminSupportSearchWhere,
  parseAdminSupportAssigneeScope,
  parseAdminSupportFolder,
} from './admin-support-query'

describe('admin support queue query', () => {
  it('opens the unanswered queue by default', () => {
    expect(parseAdminSupportFolder(undefined)).toBe('need-answer')
    expect(buildAdminSupportFolderWhere('need-answer')).toEqual({ status: 'WAITING_ADMIN' })
    expect(buildAdminSupportOrderBy('need-answer')).toEqual([
      { lastMessageAt: 'asc' },
      { id: 'asc' },
    ])
  })

  it('searches Telegram identity, messages and payment ids', () => {
    const where = buildAdminSupportSearchWhere('@mitfleg')
    expect(where).toEqual(expect.objectContaining({
      OR: expect.arrayContaining([
        { messages: { some: { body: { contains: '@mitfleg', mode: 'insensitive' } } } },
        { user: { telegramUsername: { contains: 'mitfleg', mode: 'insensitive' } } },
        { user: { payments: { some: { externalPaymentId: { contains: '@mitfleg', mode: 'insensitive' } } } } },
      ]),
    }))
  })

  it('keeps active and closed folders separate', () => {
    expect(buildAdminSupportFolderWhere('active')).toEqual({ status: { not: 'CLOSED' } })
    expect(buildAdminSupportFolderWhere('closed')).toEqual({ status: 'CLOSED' })
  })

  it('filters tickets by the current or missing assignee', () => {
    expect(parseAdminSupportAssigneeScope('mine')).toBe('mine')
    expect(parseAdminSupportAssigneeScope('unexpected')).toBe('all')
    expect(buildAdminSupportAssigneeWhere('mine', 'staff-1')).toEqual({ assigneeId: 'staff-1' })
    expect(buildAdminSupportAssigneeWhere('unassigned', 'staff-1')).toEqual({ assigneeId: null })
    expect(buildAdminSupportAssigneeWhere('all', 'staff-1')).toEqual({})
  })
})
