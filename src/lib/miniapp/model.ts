export type MiniAppOverview = {
  name: string
  subscription: null | { title: string; description: string; usable: boolean; daysLeft: number | null;
    expiresAt: string | null; planName: string; deviceLimit: number | null; pending: boolean }
  deviceCount: number
  support: boolean
  referrals: boolean
  starsEnabled: boolean
  starsRateKopecks: number | null
  warning: string | null
  plans: Array<{ id: string; name: string; description: string | null; days: number; unlimited: boolean;
    trafficLimitGb: number | null; devices: number; unlimitedDevices: boolean; maxDevices: number;
    initialDevices: number; deviceAddonEnabled: boolean; extraDevicePriceKopecks: number;
    priceKopecks: number; isPromo: boolean; current: boolean;
    isPlanSwitch: boolean; currentPlanName: string | null }>
}

export const miniAppDemo: MiniAppOverview = {
  name: 'Артём', subscription: { title: 'Подписка активна', description: 'Доступ работает. Можно подключать устройства.',
    usable: true, daysLeft: 24, expiresAt: '2026-12-05T12:00:00Z', planName: 'AlekseevVP', deviceLimit: 5, pending: false },
  deviceCount: 2, support: true, referrals: true, starsEnabled: true, starsRateKopecks: 300, warning: null,
  plans: [{ id: 'demo', name: 'AlekseevVP', description: 'Спокойный доступ каждый день', days: 30,
    unlimited: false, trafficLimitGb: null, devices: 5, unlimitedDevices: false, maxDevices: 5,
    initialDevices: 5, deviceAddonEnabled: false, extraDevicePriceKopecks: 0, priceKopecks: 29900,
    isPromo: false, current: true, isPlanSwitch: false,
    currentPlanName: 'AlekseevVP' }],
}
