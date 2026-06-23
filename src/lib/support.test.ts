import { describe, expect, it } from 'vitest'
import {
  createSupportMessageSchema,
  createSupportTicketSchema,
  supportCategoryLabel,
  supportStatusLabel,
  userUpdateSupportTicketSchema,
} from './support'

describe('support helpers', () => {
  it('validates ticket subject and message', () => {
    const parsed = createSupportTicketSchema.safeParse({
      subject: 'Не работает подключение',
      category: 'connection',
      message: 'Не получается подключиться на iPhone.',
    })

    expect(parsed.success).toBe(true)
  })

  it('rejects empty messages and user status changes except close', () => {
    expect(createSupportMessageSchema.safeParse({ message: '' }).success).toBe(false)
    expect(userUpdateSupportTicketSchema.safeParse({ status: 'WAITING_USER' }).success).toBe(false)
    expect(userUpdateSupportTicketSchema.safeParse({ status: 'CLOSED' }).success).toBe(true)
  })

  it('returns labels for known support values', () => {
    expect(supportCategoryLabel('payment')).toBe('Оплата')
    expect(supportStatusLabel('WAITING_ADMIN')).toBe('Ждет поддержки')
  })
})
