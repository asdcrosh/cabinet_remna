import { describe, expect, it } from 'vitest'
import {
  BONUS_ADMIN_TABS,
  buildBonusAdminTabHref,
  parseBonusAdminTab,
} from './bonus-box-workspace-model'

describe('admin bonuses: flat tabs', () => {
  it('has one level of four tabs in the planned order', () => {
    expect(BONUS_ADMIN_TABS.map((tab) => tab.label)).toEqual(['Призы', 'Задания и события', 'Экономика', 'История'])
  })

  it('opens prizes by default', () => {
    expect(parseBonusAdminTab(undefined)).toBe('prizes')
    expect(parseBonusAdminTab('')).toBe('prizes')
    expect(parseBonusAdminTab('unknown')).toBe('prizes')
  })

  it('keeps old links working: campaigns, history filters, prizes', () => {
    expect(parseBonusAdminTab('overview')).toBe('engagement')
    expect(parseBonusAdminTab('history')).toBe('history')
    expect(parseBonusAdminTab('prizes')).toBe('prizes')
    expect(parseBonusAdminTab('economy')).toBe('economy')
  })

  it('does not treat object keys as tabs', () => {
    expect(parseBonusAdminTab('constructor')).toBe('prizes')
    expect(parseBonusAdminTab('__proto__')).toBe('prizes')
  })

  it('writes the tab to ?view= and keeps history filters', () => {
    expect(buildBonusAdminTabHref('/dashboard/admin/bonus-box', '?q=e2e&prize=p1', 'history'))
      .toBe('/dashboard/admin/bonus-box?q=e2e&prize=p1&view=history')
    expect(buildBonusAdminTabHref('/dashboard/admin/bonus-box', 'view=history', 'prizes'))
      .toBe('/dashboard/admin/bonus-box')
  })
})
