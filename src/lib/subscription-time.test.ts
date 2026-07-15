import { describe, expect, it } from 'vitest'
import { formatSubscriptionDaysLeft, isSubscriptionExpired } from '@/lib/subscription-time'

describe('subscription time', () => {
  it('не показывает отрицательные дни для истёкшей подписки', () => {
    expect(isSubscriptionExpired(-2, 'EXPIRED')).toBe(true)
    expect(formatSubscriptionDaysLeft(-2, 'EXPIRED')).toBe('Истекла')
  })

  it('считает статус EXPIRED главным источником состояния', () => {
    expect(formatSubscriptionDaysLeft(3, 'EXPIRED')).toBe('Истекла')
  })

  it('понятно показывает последний неполный день активной подписки', () => {
    expect(formatSubscriptionDaysLeft(0, 'ACTIVE')).toBe('Менее дня')
  })

  it('оставляет обычный остаток для активной подписки', () => {
    expect(formatSubscriptionDaysLeft(7, 'ACTIVE')).toBe('7 дн.')
  })
})
