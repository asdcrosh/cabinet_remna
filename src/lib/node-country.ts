import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const COMMON_RUSSIAN_COUNTRY_NAMES: Record<string, string> = {
  GB: 'Великобритания',
  US: 'США',
}

const COUNTRY_RECORD_BYTES = 10
let countryDatabase: Buffer | undefined

export function resolveNodeCountryCode(serverIp: string, configured = process.env.NODE_PROVISIONING_COUNTRY_CODE) {
  const override = configured?.trim().toUpperCase() || 'AUTO'
  if (/^[A-Z]{2}$/.test(override) && override !== 'XX') return override
  if (!['AUTO', 'XX'].includes(override)) {
    throw new Error('NODE_PROVISIONING_COUNTRY_CODE must be AUTO or a two-letter ISO country code')
  }

  const countryCode = lookupIpv4Country(serverIp)
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode) || countryCode === 'XX') {
    throw new Error(`Не удалось автоматически определить страну ноды по IP ${serverIp}`)
  }
  return countryCode
}

function lookupIpv4Country(ip: string) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
  const ipNumber = parts.reduce((value, part) => value * 256 + part, 0)
  const database = countryDatabase ??= readFileSync(resolve(
    process.env.GEOIP_DATADIR || 'node_modules/geoip-country/data',
    'geoip-country.dat'
  ))
  let low = 0
  let high = database.length / COUNTRY_RECORD_BYTES - 1
  while (low <= high) {
    const row = Math.floor((low + high) / 2)
    const offset = row * COUNTRY_RECORD_BYTES
    const start = database.readUInt32BE(offset)
    const end = database.readUInt32BE(offset + 4)
    if (ipNumber < start) high = row - 1
    else if (ipNumber > end) low = row + 1
    else return database.toString('ascii', offset + 8, offset + 10).toUpperCase()
  }
  return null
}

export function countryFlag(countryCode: string) {
  const normalized = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized) || normalized === 'XX') return '🏴'
  return String.fromCodePoint(...[...normalized].map((letter) => 127397 + letter.charCodeAt(0)))
}

export function countryNameRu(countryCode: string) {
  const normalized = countryCode.trim().toUpperCase()
  const common = COMMON_RUSSIAN_COUNTRY_NAMES[normalized]
  if (common) return common
  const localized = new Intl.DisplayNames(['ru'], { type: 'region' }).of(normalized)
  if (!localized || localized.toUpperCase() === normalized) return normalized
  return localized.charAt(0).toLocaleUpperCase('ru-RU') + localized.slice(1)
}

export function nodeHostRemark(countryCode: string, kind: 'TCP' | 'XHTTP') {
  const suffix = kind === 'XHTTP' ? ' (Резерв)' : ''
  return `${countryFlag(countryCode)} ${countryNameRu(countryCode)}`.slice(0, 40 - suffix.length) + suffix
}
