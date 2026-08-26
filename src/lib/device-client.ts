const browserClients: Array<[RegExp, string]> = [
  [/\bEdg(?:A|iOS)?\//i, 'Microsoft Edge'],
  [/\bOPR\//i, 'Opera'],
  [/\b(?:Chrome|CriOS)\//i, 'Google Chrome'],
  [/\b(?:Firefox|FxiOS)\//i, 'Firefox'],
  [/\bVersion\/[^\s]+.*\bSafari\//i, 'Safari'],
]

export function formatDeviceClientName(userAgent: string | null | undefined) {
  const value = userAgent?.trim()
  if (!value) return null

  if (/^Mozilla\//i.test(value)) {
    const browser = browserClients.find(([pattern]) => pattern.test(value))
    if (browser) return browser[1]
  }

  const product = value.match(/^(.+?)(?:\/v?\d|\s+v?\d+(?:\.\d+)+)/i)?.[1]
    ?? value.split(/\s+\(/, 1)[0]
    ?? value
  const normalized = product
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized ? normalized.slice(0, 60) : null
}
