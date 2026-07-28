export type AdminCampaignType = 'PROMO' | 'REFERRAL' | 'WELCOME' | 'OFFER' | 'BONUS_EVENT'
export type AdminCampaignStatus = 'ACTIVE' | 'SCHEDULED' | 'ENDED' | 'DISABLED'

export type AdminCampaignRow = {
  id: string
  type: AdminCampaignType
  title: string
  description: string
  enabled: boolean
  startsAt: Date | null
  endsAt: Date | null
  href: string
  metric?: string
}

export function getAdminCampaignStatus(
  campaign: Pick<AdminCampaignRow, 'enabled' | 'startsAt' | 'endsAt'>,
  now = new Date()
): AdminCampaignStatus {
  if (!campaign.enabled) return 'DISABLED'
  if (campaign.endsAt && campaign.endsAt.getTime() <= now.getTime()) return 'ENDED'
  if (campaign.startsAt && campaign.startsAt.getTime() > now.getTime()) return 'SCHEDULED'
  return 'ACTIVE'
}

export function filterAdminCampaigns(
  campaigns: AdminCampaignRow[],
  filters: { type?: string; status?: string },
  now = new Date()
) {
  return campaigns.filter((campaign) => {
    if (filters.type && filters.type !== 'ALL' && campaign.type !== filters.type) return false
    if (filters.status && filters.status !== 'ALL' && getAdminCampaignStatus(campaign, now) !== filters.status) return false
    return true
  })
}

export function sortAdminCampaigns(campaigns: AdminCampaignRow[], now = new Date()) {
  const statusOrder: Record<AdminCampaignStatus, number> = {
    ACTIVE: 0,
    SCHEDULED: 1,
    DISABLED: 2,
    ENDED: 3,
  }

  return [...campaigns].sort((left, right) => {
    const statusDifference = statusOrder[getAdminCampaignStatus(left, now)] - statusOrder[getAdminCampaignStatus(right, now)]
    if (statusDifference !== 0) return statusDifference

    const leftDate = left.startsAt?.getTime() ?? left.endsAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    const rightDate = right.startsAt?.getTime() ?? right.endsAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    return leftDate - rightDate || left.title.localeCompare(right.title, 'ru')
  })
}
