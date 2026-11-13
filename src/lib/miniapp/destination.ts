const destinations = {
  home: '/dashboard',
  subscription: '/dashboard/subscription',
  connect: '/dashboard/subscription',
  plans: '/dashboard/plans',
  billing: '/dashboard/billing',
  devices: '/dashboard/devices',
  referrals: '/dashboard/referrals',
  bonus: '/dashboard/bonus-box',
  notifications: '/dashboard/notifications',
  support: '/dashboard/support',
  settings: '/dashboard/settings',
  admin: '/dashboard/admin',
} as const

export type MiniAppSection = keyof typeof destinations

export function miniAppDestination(section: string | null | undefined) {
  return destinations[section as MiniAppSection] ?? destinations.home
}
