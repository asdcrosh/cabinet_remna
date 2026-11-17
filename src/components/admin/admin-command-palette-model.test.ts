import { describe, expect, it } from 'vitest'
import {
  buildCommandPaletteGroups,
  buildPaymentOption,
  buildUserOption,
  filterCommandItems,
  flattenCommandPaletteOptions,
  isCommandPaletteShortcut,
  isEditableTarget,
  moveActiveIndex,
  parseAdminSearchResults,
  shouldSearchRemotely,
  type AdminSearchPaymentResult,
  type AdminSearchUserResult,
  type CommandPaletteItem,
} from './admin-command-palette-model'

const items: CommandPaletteItem[] = [
  { href: '/dashboard/admin', label: 'Обзор', group: 'Разделы' },
  { href: '/dashboard/admin/users', label: 'Пользователи', group: 'Разделы', keywords: ['клиенты', 'аккаунты'] },
  { href: '/dashboard/admin/payments', label: 'Платежи', group: 'Разделы', keywords: ['оплаты', 'ЮKassa'] },
  { href: '/dashboard/admin/bonus-box', label: 'Подарки', group: 'Маркетинг', keywords: ['бонусы', 'ёлка'] },
  { href: '/dashboard/admin/promo-codes', label: 'Промокоды', group: 'Маркетинг' },
]

const user: AdminSearchUserResult = {
  id: 'user-1',
  label: 'ivan@example.com',
  email: 'ivan@example.com',
  name: 'Иван',
  telegramUsername: 'ivan',
  planName: 'Год',
  subscriptionStatus: 'ACTIVE',
  expireAt: '2027-01-15T10:00:00.000Z',
}

const payment: AdminSearchPaymentResult = {
  id: 'pay ment/1',
  amountKopecks: 29900,
  status: 'SUCCEEDED',
  provider: 'YOOKASSA',
  createdAt: '2026-11-01T10:00:00.000Z',
  userId: 'user-1',
  userLabel: '@ivan',
  planName: 'Месяц',
}

describe('filterCommandItems', () => {
  it('returns every item for an empty query', () => {
    expect(filterCommandItems(items, '   ')).toEqual(items)
  })

  it('matches labels and keywords case-insensitively', () => {
    expect(filterCommandItems(items, 'ПЛАТ').map((item) => item.label)).toEqual(['Платежи'])
    expect(filterCommandItems(items, 'клиент').map((item) => item.label)).toEqual(['Пользователи'])
    expect(filterCommandItems(items, 'юkassa').map((item) => item.label)).toEqual(['Платежи'])
  })

  it('treats ё as е and requires every word', () => {
    expect(filterCommandItems(items, 'елка').map((item) => item.label)).toEqual(['Подарки'])
    expect(filterCommandItems(items, 'подарки бонусы').map((item) => item.label)).toEqual(['Подарки'])
    expect(filterCommandItems(items, 'подарки оплаты')).toEqual([])
  })

  it('ranks label prefix matches before keyword matches', () => {
    const ranked = filterCommandItems([
      { href: '/a', label: 'Рассылки', group: 'Разделы', keywords: ['промо'] },
      { href: '/b', label: 'Промокоды', group: 'Разделы' },
    ], 'промо')
    expect(ranked.map((item) => item.href)).toEqual(['/b', '/a'])
  })
})

describe('buildCommandPaletteGroups', () => {
  it('groups items in first-seen order when the query is empty', () => {
    const groups = buildCommandPaletteGroups({ items, query: '' })
    expect(groups.map((group) => [group.label, group.options.length])).toEqual([
      ['Разделы', 3],
      ['Маркетинг', 2],
    ])
  })

  it('puts clients and payments before item groups', () => {
    const groups = buildCommandPaletteGroups({
      items,
      query: 'плат',
      results: { users: [user], payments: [payment] },
    })
    expect(groups.map((group) => group.label)).toEqual(['Клиенты', 'Платежи', 'Разделы'])
    expect(flattenCommandPaletteOptions(groups).map((option) => option.href)).toEqual([
      '/dashboard/admin/users/user-1',
      '/dashboard/admin/payments?q=pay%20ment%2F1',
      '/dashboard/admin/payments',
    ])
  })

  it('omits empty remote groups and returns nothing when nothing matches', () => {
    expect(buildCommandPaletteGroups({ items, query: 'zzz', results: { users: [], payments: [] } })).toEqual([])
  })

  it('keeps option keys unique across kinds', () => {
    const groups = buildCommandPaletteGroups({
      items: [{ href: '/x', label: 'user-1', group: 'Разделы' }],
      query: 'user-1',
      results: { users: [user], payments: [{ ...payment, id: 'user-1' }] },
    })
    const keys = flattenCommandPaletteOptions(groups).map((option) => option.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('result options', () => {
  it('describes a client with name and subscription', () => {
    const option = buildUserOption(user)
    expect(option.label).toBe('ivan@example.com')
    expect(option.description).toMatch(/^Иван · @ivan · Год Активна до /)
  })

  it('does not repeat telegram for telegram-only accounts', () => {
    const option = buildUserOption({
      ...user,
      label: '@ivan',
      email: 'telegram-1@pending.invalid',
      name: null,
      subscriptionStatus: null,
      planName: null,
      expireAt: null,
    })
    expect(option.description).toBe('Без подписки')
  })

  it('describes a payment with amount, plan and status', () => {
    const option = buildPaymentOption(payment)
    expect(option.label).toBe('299 ₽ · Месяц')
    expect(option.description).toMatch(/^@ivan · Оплачен · ЮKassa · /)
  })
})

describe('moveActiveIndex', () => {
  it('wraps in both directions', () => {
    expect(moveActiveIndex(0, 1, 3)).toBe(1)
    expect(moveActiveIndex(2, 1, 3)).toBe(0)
    expect(moveActiveIndex(0, -1, 3)).toBe(2)
  })

  it('handles empty lists and missing selection', () => {
    expect(moveActiveIndex(0, 1, 0)).toBe(-1)
    expect(moveActiveIndex(-1, 1, 3)).toBe(0)
    expect(moveActiveIndex(-1, -1, 3)).toBe(2)
    expect(moveActiveIndex(7, 1, 3)).toBe(0)
  })
})

describe('shouldSearchRemotely', () => {
  it('requires permission and 2..100 characters', () => {
    expect(shouldSearchRemotely('iv', true)).toBe(true)
    expect(shouldSearchRemotely(' i ', true)).toBe(false)
    expect(shouldSearchRemotely('ivan', false)).toBe(false)
    expect(shouldSearchRemotely('x'.repeat(101), true)).toBe(false)
  })
})

describe('isCommandPaletteShortcut', () => {
  const base = { key: 'k', code: 'KeyK', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }

  it('accepts ⌘K and Ctrl+K, including the Russian layout', () => {
    expect(isCommandPaletteShortcut({ ...base, metaKey: true })).toBe(true)
    expect(isCommandPaletteShortcut({ ...base, ctrlKey: true })).toBe(true)
    expect(isCommandPaletteShortcut({ ...base, key: 'л', metaKey: true })).toBe(true)
    expect(isCommandPaletteShortcut({ ...base, key: 'K', code: undefined, ctrlKey: true })).toBe(true)
  })

  it('ignores plain K and other modifiers', () => {
    expect(isCommandPaletteShortcut(base)).toBe(false)
    expect(isCommandPaletteShortcut({ ...base, metaKey: true, shiftKey: true })).toBe(false)
    expect(isCommandPaletteShortcut({ ...base, ctrlKey: true, altKey: true })).toBe(false)
    expect(isCommandPaletteShortcut({ ...base, key: 'j', code: 'KeyJ', metaKey: true })).toBe(false)
  })
})

describe('isEditableTarget', () => {
  it('detects text fields and contenteditable elements', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'textarea' })).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

describe('parseAdminSearchResults', () => {
  it('accepts the API shape and drops malformed rows', () => {
    expect(parseAdminSearchResults({ users: [user, { id: 1 }], payments: [payment, null] })).toEqual({
      users: [user],
      payments: [payment],
    })
  })

  it('rejects unexpected payloads', () => {
    expect(parseAdminSearchResults(null)).toBeNull()
    expect(parseAdminSearchResults({ error: 'Forbidden' })).toBeNull()
    expect(parseAdminSearchResults({ users: [], payments: 'nope' })).toBeNull()
  })
})
