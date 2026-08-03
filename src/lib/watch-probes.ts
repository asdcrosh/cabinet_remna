import tls from 'node:tls'
import { connect as connectTcp, isIP } from 'node:net'
import type { RemnawaveHost, RemnawaveNode, RemnawaveNodeInbound } from './remnawave'

export type TransportProbe = {
  status: 'OK' | 'FAIL' | 'SKIPPED'
  latencyMs: number | null
  error: string | null
}

export type WatchNodeCheck = {
  node: RemnawaveNode
  apiStatus: TransportProbe['status']
  xhttp: TransportProbe
  tcp: TransportProbe
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'DISABLED' | 'UNKNOWN'
  error: string | null
}

export type ProbeTarget = {
  host: string
  port: number
  servername: string
  path?: string
}

export async function checkRemnawaveNode(
  node: RemnawaveNode,
  timeoutMs: number,
  hosts: RemnawaveHost[] = [],
): Promise<WatchNodeCheck> {
  if (node.isDisabled) {
    const skipped = skippedProbe()
    return { node, apiStatus: 'SKIPPED', xhttp: skipped, tcp: skipped, status: 'DISABLED', error: null }
  }

  const inbounds = node.configProfile?.activeInbounds ?? []
  const xhttpTargets = inbounds
    .filter((item) => inboundNetwork(item) === 'xhttp')
    .flatMap((inbound) => resolveProbeTargets(node, inbound, 'xhttp', hosts))
  const tcpTargets = inbounds
    .filter((item) => inboundNetwork(item) === 'tcp')
    .flatMap((inbound) => resolveProbeTargets(node, inbound, 'tcp', hosts))
  const [xhttp, tcp] = await Promise.all([
    probeTargets(xhttpTargets, (target) => probeTlsTarget(target, timeoutMs, true)),
    probeTargets(tcpTargets, (target) => probeTcpTarget(target, timeoutMs)),
  ])
  const apiStatus = node.isConnected ? 'OK' : 'FAIL'
  const status = resolveNodeStatus({
    connected: node.isConnected,
    disabled: node.isDisabled,
    xhttp: xhttp.status,
    tcp: tcp.status,
  })

  const errors = [
    !node.isConnected ? 'Node API не подключён к панели' : null,
    xhttp.error ? `XHTTP: ${xhttp.error}` : null,
    tcp.error ? `TCP: ${tcp.error}` : null,
  ].filter(Boolean)

  return {
    node,
    apiStatus,
    xhttp,
    tcp,
    status,
    error: errors.length ? errors.join(' · ') : null,
  }
}

export function resolveNodeStatus(input: {
  connected: boolean
  disabled: boolean
  xhttp: TransportProbe['status']
  tcp: TransportProbe['status']
}) {
  if (input.disabled) return 'DISABLED' as const
  const attempted = [input.xhttp, input.tcp].filter((status) => status !== 'SKIPPED')
  const successful = attempted.filter((status) => status === 'OK').length
  const failed = attempted.filter((status) => status === 'FAIL').length
  if (failed > 0 && successful === 0) return 'DOWN' as const
  if (!input.connected && successful === 0) return 'DOWN' as const
  if (!input.connected || failed > 0) return 'DEGRADED' as const
  return 'HEALTHY' as const
}

function inboundNetwork(inbound: RemnawaveNodeInbound) {
  return inbound.network || inbound.rawInbound?.streamSettings?.network
}

export function resolveProbeTargets(
  node: RemnawaveNode,
  inbound: RemnawaveNodeInbound,
  kind: 'xhttp' | 'tcp',
  hosts: RemnawaveHost[] = [],
): ProbeTarget[] {
  const stream = inbound.rawInbound?.streamSettings
  const serverNames = stream?.realitySettings?.serverNames ?? []
  const publicTargets = hosts
    .filter((host) => isDedicatedPublicHostForInbound(host, node, inbound))
    .map((host) => {
      const address = stripAddress(host.address)
      const servername = host.sni?.trim() || firstHostValue(host.host) || address
      return createTarget({
        address,
        port: host.port,
        servername,
        path: kind === 'xhttp' ? normalizePath(host.path || stream?.xhttpSettings?.path) : undefined,
      })
    })
    .filter((target): target is ProbeTarget => target !== null)

  if (publicTargets.length > 0) return uniqueTargets(publicTargets)

  const address = stripAddress(node.address)
  const servername = serverNames.find((name) => name === address) || serverNames[0] || address
  const fallback = createTarget({
    address,
    port: Number(inbound.port || inbound.rawInbound?.port || (kind === 'xhttp' ? 443 : 10443)),
    servername,
    path: kind === 'xhttp' ? normalizePath(stream?.xhttpSettings?.path) : undefined,
  })
  return fallback ? [fallback] : []
}

function isDedicatedPublicHostForInbound(
  host: RemnawaveHost,
  node: RemnawaveNode,
  inbound: RemnawaveNodeInbound,
) {
  if (host.isDisabled || host.isHidden || host.nodes.length !== 1 || host.nodes[0] !== node.uuid) return false
  if (!inbound.uuid || host.inbound.configProfileInboundUuid !== inbound.uuid) return false
  const activeProfileUuid = node.configProfile?.activeConfigProfileUuid
  return !activeProfileUuid || !host.inbound.configProfileUuid || host.inbound.configProfileUuid === activeProfileUuid
}

function createTarget(input: { address: string; port: number; servername: string; path?: string }): ProbeTarget | null {
  const port = Number(input.port)
  if (!input.address || !input.servername || !Number.isInteger(port) || port < 1 || port > 65_535) return null
  return { host: input.address, port, servername: input.servername, path: input.path }
}

function firstHostValue(value?: string | null) {
  return value?.split(',')[0]?.trim() || ''
}

function uniqueTargets(targets: ProbeTarget[]) {
  return [...new Map(targets.map((target) => [
    `${target.host}:${target.port}:${target.servername}:${target.path || ''}`,
    target,
  ])).values()]
}

function stripAddress(address: string) {
  const value = address.trim()
  if (!value) return ''
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname
  } catch {
    return value.replace(/^\[|\]$/g, '')
  }
}

function normalizePath(path?: string) {
  if (!path) return '/'
  return path.startsWith('/') ? path : `/${path}`
}

function skippedProbe(): TransportProbe {
  return { status: 'SKIPPED', latencyMs: null, error: null }
}

async function probeTargets(
  targets: ProbeTarget[],
  probe: (target: ProbeTarget) => Promise<TransportProbe>,
): Promise<TransportProbe> {
  if (targets.length === 0) return skippedProbe()
  const attempts = await Promise.all(targets.map(async (target) => ({ target, result: await probe(target) })))
  const successful = attempts
    .filter((attempt) => attempt.result.status === 'OK')
    .sort((left, right) => (left.result.latencyMs ?? Infinity) - (right.result.latencyMs ?? Infinity))[0]
  if (successful) return successful.result

  return {
    status: 'FAIL',
    latencyMs: null,
    error: attempts
      .map(({ target, result }) => `${target.host}:${target.port} — ${result.error || 'ошибка проверки'}`)
      .join(' · ')
      .slice(0, 500),
  }
}

function probeTlsTarget(target: ProbeTarget, timeoutMs: number, expectHttp: boolean): Promise<TransportProbe> {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    let finished = false
    let response = ''
    const finish = (result: TransportProbe) => {
      if (finished) return
      finished = true
      socket.destroy()
      resolve(result)
    }
    const socket = tls.connect({
      host: target.host,
      port: target.port,
      servername: isIP(target.servername) ? undefined : target.servername,
      rejectUnauthorized: true,
      ALPNProtocols: ['http/1.1'],
    })
    socket.setTimeout(timeoutMs)
    socket.once('secureConnect', () => {
      const latencyMs = Math.max(1, Math.round(performance.now() - startedAt))
      if (!expectHttp) {
        finish({ status: 'OK', latencyMs, error: null })
        return
      }
      socket.write(`GET ${target.path || '/'} HTTP/1.1\r\nHost: ${target.servername}\r\nConnection: close\r\nUser-Agent: cabinet-watch/1\r\n\r\n`)
    })
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8')
      const match = response.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/)
      if (!match) return
      const code = Number(match[1])
      const latencyMs = Math.max(1, Math.round(performance.now() - startedAt))
      finish(code < 500
        ? { status: 'OK', latencyMs, error: null }
        : { status: 'FAIL', latencyMs, error: `HTTP ${code}` })
    })
    socket.once('timeout', () => finish({ status: 'FAIL', latencyMs: null, error: `таймаут ${timeoutMs} мс` }))
    socket.once('error', (error) => finish({ status: 'FAIL', latencyMs: null, error: compactError(error) }))
    socket.once('close', () => {
      if (!finished) finish({ status: 'FAIL', latencyMs: null, error: 'соединение закрыто без ответа' })
    })
  })
}

// REALITY intentionally does not behave as a regular public TLS endpoint for
// an unauthenticated probe. A TCP connect verifies the public L4 edge; Xray
// readiness itself comes from the authenticated Node API state above.
function probeTcpTarget(target: ProbeTarget, timeoutMs: number): Promise<TransportProbe> {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    let finished = false
    const socket = connectTcp({ host: target.host, port: target.port })
    const finish = (result: TransportProbe) => {
      if (finished) return
      finished = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish({
      status: 'OK',
      latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      error: null,
    }))
    socket.once('timeout', () => finish({ status: 'FAIL', latencyMs: null, error: `таймаут ${timeoutMs} мс` }))
    socket.once('error', (error) => finish({ status: 'FAIL', latencyMs: null, error: compactError(error) }))
  })
}

function compactError(error: Error) {
  return error.message.replace(/[\r\n]+/g, ' ').slice(0, 180)
}
