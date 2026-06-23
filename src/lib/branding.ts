const DEFAULT_BRAND_NAME = 'VPN Cabinet'

export function getBrandName() {
  const value = process.env.CABINET_BRAND_NAME?.trim()
  return value || DEFAULT_BRAND_NAME
}

export function getPageTitle(title: string) {
  return `${title} — ${getBrandName()}`
}
