import { describe, expect, it } from 'vitest'
import {
  createSupportMessageSchema,
  createSupportTicketSchema,
  supportCategorySubject,
  supportCategoryLabel,
  supportStatusLabel,
  supportStatusLabelForRole,
  userUpdateSupportTicketSchema,
} from './support'

describe('support helpers', () => {
  it('validates ticket category and message', () => {
    const parsed = createSupportTicketSchema.safeParse({
      category: 'connection',
      message: 'Не получается подключиться на iPhone.',
    })

    expect(parsed.success).toBe(true)
    expect(createSupportTicketSchema.safeParse({
      message: 'Не получается подключиться на iPhone.',
    }).success).toBe(true)
    expect(createSupportTicketSchema.safeParse({
      subject: 'Очень длинная свободная тема',
      category: 'connection',
      message: 'Не получается подключиться на iPhone.',
    }).success).toBe(false)
  })

  it('rejects empty messages and user status changes except close', () => {
    expect(createSupportMessageSchema.safeParse({ message: '' }).success).toBe(false)
    expect(userUpdateSupportTicketSchema.safeParse({ status: 'WAITING_USER' }).success).toBe(false)
    expect(userUpdateSupportTicketSchema.safeParse({ status: 'CLOSED' }).success).toBe(true)
  })

  it('returns labels for known support values', () => {
    expect(supportCategoryLabel('payment')).toBe('Оплата')
    expect(supportCategorySubject('connection')).toBe('Проблема с подключением')
    expect(supportStatusLabel('WAITING_ADMIN')).toBe('Ожидает ответа')
    expect(supportStatusLabelForRole('WAITING_ADMIN', 'admin')).toBe('Нужно ответить')
    expect(supportStatusLabelForRole('WAITING_USER', 'user')).toBe('Ответ получен')
  })
})
