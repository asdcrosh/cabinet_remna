import { describe, expect, it } from 'vitest'
import {
  ADMIN_NEW_PROMO_HREF,
  adminPromoSourceWhere,
  buildAdminPromoSourceHref,
  parseAdminPromoSource,
  shouldOpenPromoEditor,
} from './admin-promo-source'

describe('admin promo source filter', () => {
  it('shows created codes by default and roulette codes only on request', () => {
    expect(parseAdminPromoSource(undefined)).toBe('created')
    expect(parseAdminPromoSource('')).toBe('created')
    expect(parseAdminPromoSource('anything')).toBe('created')
    expect(parseAdminPromoSource('box')).toBe('box')
  })

  it('splits codes by roulette openings, the same sign as the row origin', () => {
    expect(adminPromoSourceWhere('created')).toEqual({ bonusBoxOpenings: { none: {} } })
    expect(adminPromoSourceWhere('box')).toEqual({ bonusBoxOpenings: { some: {} } })
  })

  it('keeps the search but resets the loaded page size when switching source', () => {
    expect(buildAdminPromoSourceHref('/dashboard/admin/promo-codes', 'q=SUMMER&limit=75', 'box'))
      .toBe('/dashboard/admin/promo-codes?q=SUMMER&source=box')
    expect(buildAdminPromoSourceHref('/dashboard/admin/promo-codes', new URLSearchParams('source=box&limit=50'), 'created'))
      .toBe('/dashboard/admin/promo-codes')
  })

  it('never carries the one-shot ?new=1 into another list', () => {
    expect(buildAdminPromoSourceHref('/dashboard/admin/promo-codes', 'new=1', 'box'))
      .toBe('/dashboard/admin/promo-codes?source=box')
  })

  it('opens the promo form straight from «Новая скидка»', () => {
    expect(ADMIN_NEW_PROMO_HREF).toBe('/dashboard/admin/promo-codes?new=1')
    expect(shouldOpenPromoEditor('1')).toBe(true)
    expect(shouldOpenPromoEditor(undefined)).toBe(false)
    expect(shouldOpenPromoEditor('true')).toBe(false)
  })
})
