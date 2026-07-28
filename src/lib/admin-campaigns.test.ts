import { describe, expect, it } from 'vitest'
import {
  filterAdminCampaigns,
  getAdminCampaignStatus,
  sortAdminCampaigns,
  type AdminCampaignRow,
} from './admin-campaigns'

const now = new Date('2026-07-28T12:00:00.000Z')

function campaign(overrides: Partial<AdminCampaignRow> = {}): AdminCampaignRow {
  return {
    id: 'campaign',
    type: 'PROMO',
    title: 'Кампания',
    description: 'Описание',
    enabled: true,
    startsAt: null,
    endsAt: null,
    href: '/dashboard/admin/promo-codes',
    ...overrides,
  }
}

describe('admin campaigns', () => {
  it('derives lifecycle status from enabled state and schedule', () => {
    expect(getAdminCampaignStatus(campaign(), now)).toBe('ACTIVE')
    expect(getAdminCampaignStatus(campaign({ enabled: false }), now)).toBe('DISABLED')
    expect(getAdminCampaignStatus(campaign({ startsAt: new Date('2026-07-29T12:00:00.000Z') }), now)).toBe('SCHEDULED')
    expect(getAdminCampaignStatus(campaign({ endsAt: new Date('2026-07-27T12:00:00.000Z') }), now)).toBe('ENDED')
  })

  it('filters and places active campaigns first', () => {
    const campaigns = [
      campaign({ id: 'ended', endsAt: new Date('2026-07-27T12:00:00.000Z') }),
      campaign({ id: 'scheduled', type: 'BONUS_EVENT', startsAt: new Date('2026-07-29T12:00:00.000Z') }),
      campaign({ id: 'active', type: 'BONUS_EVENT' }),
    ]

    expect(filterAdminCampaigns(campaigns, { type: 'BONUS_EVENT', status: 'ACTIVE' }, now).map((item) => item.id)).toEqual(['active'])
    expect(sortAdminCampaigns(campaigns, now).map((item) => item.id)).toEqual(['active', 'scheduled', 'ended'])
  })
})
