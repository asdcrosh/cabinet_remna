// GET /api/vpn-check — проверка, проходит ли текущий запрос пользователя
// через одну из публичных нод Remnawave.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/guard'
import { countryNameRu } from '@/lib/node-country'
import { remnawave, type RemnawaveNode } from '@/lib/remnawave'
import { getClientIp } from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NODE_IP_CACHE_TTL_MS = 5 * 60 * 1000
const nodeIpCache = new Map<string, { expiresAt: number; ips: string[] }>()

export const GET = withAuth(async (request: Request) => {
  const publicIp = resolveRequestIp(request)
  if (!publicIp) {
    return NextResponse.json({
      status: 'unknown',
      message: 'Не удалось определить внешний IP устройства.',
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const nodes = (await remnawave.getNodes()).response
  const node = await findMatchedNode(publicIp, nodes)

  return NextResponse.json({
    status: node ? 'vpn' : 'direct',
    publicIp,
    node: node
      ? {
          name: node.name,
          country: node.countryCode ? countryNameRu(node.countryCode) : null,
        }
      : null,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
})

function resolveRequestIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const value = getClientIp(request) || forwarded || request.headers.get('x-real-ip') || ''
  return normalizeIp(value)
}

async function findMatchedNode(publicIp: string, nodes: RemnawaveNode[]) {
  const candidates = nodes.filter((node) => node.isConnected && !node.isDisabled)
  const addresses = await Promise.all(candidates.map(async (node) => ({
    node,
    ips: await resolveNodeIps(node.address),
  })))
  return addresses.find((entry) => entry.ips.includes(publicIp))?.node ?? null
}

async function resolveNodeIps(address: string) {
  const host = extractHostname(address)
  if (!host) return []
  const cached = nodeIpCache.get(host)
  if (cached && cached.expiresAt > Date.now()) return cached.ips

  const directIp = normalizeIp(host)
  const ips = directIp
    ? [directIp]
    : await lookup(host, { all: true, verbatim: true })
      .then((records) => records.map((record) => normalizeIp(record.address)).filter(Boolean) as string[])
      .catch(() => [])

  nodeIpCache.set(host, { ips, expiresAt: Date.now() + NODE_IP_CACHE_TTL_MS })
  return ips
}

function extractHostname(address: string) {
  const value = address.trim()
  if (!value) return ''
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname
  } catch {
    return value.replace(/^\[|\]$/g, '')
  }
}

function normalizeIp(value: string) {
  const normalized = value.trim().replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '')
  return isIP(normalized) ? normalized.toLowerCase() : null
}
