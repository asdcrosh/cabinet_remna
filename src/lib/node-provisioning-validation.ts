import { z } from 'zod'

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/
const sshUserPattern = /^[a-z_][a-z0-9_-]{0,31}$/i

export const createNodeProvisioningSchema = z.object({
  nodeName: z.string().trim().toLowerCase().min(3).max(30).regex(slugPattern, 'Некорректное имя ноды'),
  serverIp: z.string().trim().refine(isPublicIpv4, 'Нужен публичный IPv4-адрес'),
  sshPort: z.coerce.number().int().min(1).max(65535).default(22),
  sshUser: z.string().trim().regex(sshUserPattern, 'Некорректный SSH-пользователь'),
  sshPassword: z.string().min(8).max(512),
  tcpTemplateHostUuid: z.string().uuid(),
  xhttpTemplateHostUuid: z.string().uuid(),
})

export function buildProvisioningFqdn(nodeName: string) {
  const baseDomain = process.env.NODE_PROVISIONING_BASE_DOMAIN?.trim().toLowerCase().replace(/^\.+|\.+$/g, '')
  if (!baseDomain || !isDomain(baseDomain)) {
    throw new Error('NODE_PROVISIONING_BASE_DOMAIN is not configured')
  }
  return `${nodeName}.${baseDomain}`
}

export function isPublicIpv4(value: string) {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some((octet) => octet < 0 || octet > 255)) return false
  if (parts.some((part, index) => String(octets[index]) !== part)) return false

  const a = octets[0]!
  const b = octets[1]!
  const c = octets[2]!
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0 && c === 0) return false
  if (a === 192 && b === 0 && c === 2) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function isDomain(value: string) {
  if (value.length > 253 || !value.includes('.')) return false
  const labels = value.split('.')
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    && /^[a-z]{2,63}$/.test(labels.at(-1) || '')
}
