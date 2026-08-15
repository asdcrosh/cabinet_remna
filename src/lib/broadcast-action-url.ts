export function normalizeBroadcastActionHref(value: string | null | undefined, appUrl: string) {
  const href = value?.trim()
  if (!href) return null

  if (href.startsWith('/')) {
    return href.startsWith('/dashboard') ? href : null
  }

  try {
    const url = new URL(href)
    if (url.protocol !== 'https:') return null
    if (url.origin === new URL(appUrl).origin) return `${url.pathname}${url.search}${url.hash}`
    return url.toString()
  } catch {
    return null
  }
}

export function getBroadcastActionUrl(actionHref: string | null, appUrl: string) {
  if (!actionHref) return appUrl
  return actionHref.startsWith('https://') ? actionHref : new URL(actionHref, appUrl).toString()
}

export function isExternalBroadcastActionHref(actionHref: string | null | undefined) {
  return Boolean(actionHref?.startsWith('https://'))
}
