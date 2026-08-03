import type { WatchIncidentType, WatchProbeStatus } from '@prisma/client'
import { prisma } from './prisma'
import { remnawave, type RemnawaveNode } from './remnawave'
import { checkRemnawaveNode, type WatchNodeCheck } from './watch-probes'
import { getWatchConfig } from './watch-config'
import { sendWatchAlert, type WatchAlertEvent } from './watch-alerts'
import { withDistributedLock } from './distributed-lock'
import { logError, logInfo, logWarn } from './logger'

type IncidentChannel = {
  type: WatchIncidentType
  status: WatchProbeStatus
  failureCount: number
  successCount: number
  message: string | null
}

export async function runWatchCycle(source: 'worker' | 'manual' = 'worker') {
  const config = getWatchConfig()
  if (!config.enabled) return { acquired: false, disabled: true }

  const lock = await withDistributedLock('cabinet-watch-cycle', async () => {
    const startedAt = Date.now()
    const events: WatchAlertEvent[] = []
    try {
      let payload: Awaited<ReturnType<typeof remnawave.getNodes>>
      try {
        payload = await remnawave.getNodes()
        events.push(...await markPanelSuccess(config.recoveryThreshold))
      } catch (error) {
        events.push(...await markPanelFailure(error, config.failureThreshold))
        throw error
      }
      const nodes = Array.isArray(payload.response) ? payload.response : []
      const checks = await Promise.all(nodes.map((node) => checkRemnawaveNode(node, config.timeoutMs)))

      for (const check of checks) {
        events.push(...await persistNodeCheck(check, config.failureThreshold, config.recoveryThreshold))
      }

      const networkStatus = checks.some((item) => item.status === 'DOWN')
        ? 'DOWN'
        : checks.some((item) => item.status === 'DEGRADED')
          ? 'DEGRADED'
          : checks.length
            ? 'HEALTHY'
            : 'UNKNOWN'
      await prisma.watchRuntimeState.update({
        where: { id: 'default' },
        data: { status: networkStatus, lastRunAt: new Date(), lastSuccessAt: new Date(), lastError: null },
      })
      await cleanupWatchHistory(config.retentionDays)
      logInfo('watch.cycle_complete', { source, nodes: checks.length, durationMs: Date.now() - startedAt, networkStatus })
      return { nodes: checks.length, networkStatus }
    } catch (error) {
      logError('watch.cycle_failed', error, { source, durationMs: Date.now() - startedAt })
      throw error
    } finally {
      await Promise.allSettled(events.map((event) => sendWatchAlert(event)))
    }
  })

  if (!lock.acquired) logWarn('watch.cycle_skipped_locked', { source })
  return { acquired: lock.acquired, disabled: false, result: lock.acquired ? lock.value : null }
}

async function persistNodeCheck(check: WatchNodeCheck, failureThreshold: number, recoveryThreshold: number) {
  const previous = await prisma.watchNodeState.findUnique({ where: { nodeUuid: check.node.uuid } })
  const apiCounters = nextCounters(check.apiStatus, previous?.apiConsecutiveFailures, previous?.apiConsecutiveSuccesses)
  const xhttpCounters = nextCounters(check.xhttp.status, previous?.xhttpConsecutiveFailures, previous?.xhttpConsecutiveSuccesses)
  const tcpCounters = nextCounters(check.tcp.status, previous?.tcpConsecutiveFailures, previous?.tcpConsecutiveSuccesses)
  const metrics = readNodeMetrics(check.node)
  const checkedAt = new Date()

  await prisma.$transaction([
    prisma.watchNodeState.upsert({
      where: { nodeUuid: check.node.uuid },
      create: {
        nodeUuid: check.node.uuid,
        name: check.node.name,
        address: check.node.address,
        countryCode: check.node.countryCode,
        isConnected: check.node.isConnected,
        isDisabled: check.node.isDisabled,
        status: check.status,
        apiStatus: check.apiStatus,
        xhttpStatus: check.xhttp.status,
        tcpStatus: check.tcp.status,
        xhttpLatencyMs: check.xhttp.latencyMs,
        tcpLatencyMs: check.tcp.latencyMs,
        ...metrics,
        ...counterFields(apiCounters, xhttpCounters, tcpCounters),
        lastCheckedAt: checkedAt,
        lastHealthyAt: check.status === 'HEALTHY' ? checkedAt : null,
        lastError: check.error,
      },
      update: {
        name: check.node.name,
        address: check.node.address,
        countryCode: check.node.countryCode,
        isConnected: check.node.isConnected,
        isDisabled: check.node.isDisabled,
        status: check.status,
        apiStatus: check.apiStatus,
        xhttpStatus: check.xhttp.status,
        tcpStatus: check.tcp.status,
        xhttpLatencyMs: check.xhttp.latencyMs,
        tcpLatencyMs: check.tcp.latencyMs,
        ...metrics,
        ...counterFields(apiCounters, xhttpCounters, tcpCounters),
        lastCheckedAt: checkedAt,
        ...(check.status === 'HEALTHY' ? { lastHealthyAt: checkedAt } : {}),
        lastError: check.error,
      },
    }),
    prisma.watchProbe.create({
      data: {
        nodeUuid: check.node.uuid,
        status: check.status,
        apiStatus: check.apiStatus,
        xhttpStatus: check.xhttp.status,
        tcpStatus: check.tcp.status,
        xhttpLatencyMs: check.xhttp.latencyMs,
        tcpLatencyMs: check.tcp.latencyMs,
        isConnected: check.node.isConnected,
        isDisabled: check.node.isDisabled,
        error: check.error,
        ...probeMetrics(metrics),
      },
    }),
  ])

  const channels: IncidentChannel[] = [
    {
      type: 'NODE_API', status: check.apiStatus,
      failureCount: apiCounters.failures, successCount: apiCounters.successes,
      message: check.apiStatus === 'FAIL' ? 'Нода не держит управляющее соединение с Remnawave Panel.' : null,
    },
    {
      type: 'XHTTP', status: check.xhttp.status,
      failureCount: xhttpCounters.failures, successCount: xhttpCounters.successes,
      message: check.xhttp.error,
    },
    {
      type: 'REALITY_TCP', status: check.tcp.status,
      failureCount: tcpCounters.failures, successCount: tcpCounters.successes,
      message: check.tcp.error,
    },
  ]
  const events: WatchAlertEvent[] = []
  for (const channel of channels) {
    events.push(...await reconcileIncident(check.node, channel, failureThreshold, recoveryThreshold))
  }
  return events
}

async function reconcileIncident(
  node: RemnawaveNode,
  channel: IncidentChannel,
  failureThreshold: number,
  recoveryThreshold: number
) {
  const open = await prisma.watchIncident.findFirst({
    where: { nodeUuid: node.uuid, type: channel.type, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  })
  if (channel.status === 'SKIPPED') {
    if (!open) return []
    const message = node.isDisabled
      ? 'Нода отключена в Remnawave, активная проверка остановлена.'
      : `${incidentLabel(channel.type)} больше не назначен активному профилю ноды.`
    const incident = await prisma.watchIncident.update({
      where: { id: open.id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), lastObservedAt: new Date() },
    })
    return [toAlert({ ...incident, title: `${node.name}: наблюдение ${incidentLabel(channel.type)} завершено`, message }, 'RESOLVED')]
  }
  if (channel.status === 'FAIL') {
    if (open) {
      await prisma.watchIncident.update({
        where: { id: open.id },
        data: { occurrences: { increment: 1 }, lastObservedAt: new Date(), message: channel.message || open.message },
      })
      return []
    }
    if (channel.failureCount < failureThreshold) return []
    const incident = await prisma.watchIncident.create({
      data: {
        nodeUuid: node.uuid,
        nodeName: node.name,
        type: channel.type,
        title: `${node.name}: ${incidentLabel(channel.type)} недоступен`,
        message: channel.message || `${incidentLabel(channel.type)} не отвечает после ${channel.failureCount} проверок.`,
      },
    })
    return [toAlert(incident, 'OPEN')]
  }
  if (!open || channel.successCount < recoveryThreshold) return []
  const incident = await prisma.watchIncident.update({
    where: { id: open.id },
    data: { status: 'RESOLVED', resolvedAt: new Date(), lastObservedAt: new Date() },
  })
  return [toAlert({ ...incident, title: `${node.name}: ${incidentLabel(channel.type)} восстановлен`, message: `Успешно пройдено ${channel.successCount} проверки подряд.` }, 'RESOLVED')]
}

async function markPanelFailure(error: unknown, failureThreshold: number) {
  const message = compactError(error)
  const previous = await prisma.watchRuntimeState.findUnique({ where: { id: 'default' } })
  const failures = (previous?.consecutiveFailures ?? 0) + 1
  await prisma.watchRuntimeState.upsert({
    where: { id: 'default' },
    create: { id: 'default', status: 'DOWN', consecutiveFailures: failures, lastRunAt: new Date(), lastError: message },
    update: { status: 'DOWN', consecutiveFailures: failures, consecutiveSuccesses: 0, lastRunAt: new Date(), lastError: message },
  })
  const open = await prisma.watchIncident.findFirst({ where: { nodeUuid: null, type: 'PANEL_API', status: 'OPEN' } })
  if (open) {
    await prisma.watchIncident.update({ where: { id: open.id }, data: { occurrences: { increment: 1 }, lastObservedAt: new Date(), message } })
    return []
  }
  if (failures < failureThreshold) return []
  const incident = await prisma.watchIncident.create({
    data: { type: 'PANEL_API', title: 'Remnawave Panel API недоступен', message },
  })
  return [toAlert(incident, 'OPEN')]
}

async function markPanelSuccess(recoveryThreshold: number) {
  const previous = await prisma.watchRuntimeState.findUnique({ where: { id: 'default' } })
  const successes = (previous?.consecutiveSuccesses ?? 0) + 1
  await prisma.watchRuntimeState.upsert({
    where: { id: 'default' },
    create: { id: 'default', status: 'HEALTHY', consecutiveSuccesses: successes, lastRunAt: new Date(), lastSuccessAt: new Date() },
    update: { consecutiveFailures: 0, consecutiveSuccesses: successes, lastRunAt: new Date(), lastSuccessAt: new Date(), lastError: null },
  })
  const open = await prisma.watchIncident.findFirst({ where: { nodeUuid: null, type: 'PANEL_API', status: 'OPEN' } })
  if (!open || successes < recoveryThreshold) return []
  const incident = await prisma.watchIncident.update({
    where: { id: open.id },
    data: { status: 'RESOLVED', resolvedAt: new Date(), lastObservedAt: new Date() },
  })
  return [toAlert({ ...incident, title: 'Remnawave Panel API восстановлен', message: `Успешно пройдено ${successes} проверки подряд.` }, 'RESOLVED')]
}

export async function getWatchReport() {
  const config = getWatchConfig()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [runtime, nodes, incidents, probes] = await Promise.all([
    prisma.watchRuntimeState.findUnique({ where: { id: 'default' } }),
    prisma.watchNodeState.findMany({ orderBy: [{ isDisabled: 'asc' }, { name: 'asc' }] }),
    prisma.watchIncident.findMany({ orderBy: { openedAt: 'desc' }, take: 30 }),
    prisma.watchProbe.findMany({ where: { checkedAt: { gte: since } }, orderBy: { checkedAt: 'desc' }, take: 3000 }),
  ])
  const series = new Map<string, Array<{ at: string; latencyMs: number | null; status: string }>>()
  for (const probe of probes) {
    const entries = series.get(probe.nodeUuid) ?? []
    if (entries.length < 60) {
      entries.push({
        at: probe.checkedAt.toISOString(),
        latencyMs: averageLatency(probe.xhttpLatencyMs, probe.tcpLatencyMs),
        status: probe.status,
      })
      series.set(probe.nodeUuid, entries)
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    config: {
      enabled: config.enabled,
      intervalSeconds: config.intervalSeconds,
      failureThreshold: config.failureThreshold,
      recoveryThreshold: config.recoveryThreshold,
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && config.telegramChatId),
    },
    runtime: runtime ? {
      status: runtime.status,
      lastRunAt: runtime.lastRunAt?.toISOString() ?? null,
      lastSuccessAt: runtime.lastSuccessAt?.toISOString() ?? null,
      lastError: runtime.lastError,
    } : null,
    summary: {
      total: nodes.length,
      healthy: nodes.filter((node) => node.status === 'HEALTHY').length,
      degraded: nodes.filter((node) => node.status === 'DEGRADED').length,
      down: nodes.filter((node) => node.status === 'DOWN').length,
      disabled: nodes.filter((node) => node.status === 'DISABLED').length,
      usersOnline: nodes.reduce((sum, node) => sum + node.usersOnline, 0),
      openIncidents: incidents.filter((incident) => incident.status === 'OPEN').length,
    },
    nodes: nodes.map((node) => ({
      nodeUuid: node.nodeUuid,
      name: node.name,
      address: node.address,
      countryCode: node.countryCode,
      status: node.status,
      isConnected: node.isConnected,
      isDisabled: node.isDisabled,
      apiStatus: node.apiStatus,
      xhttpStatus: node.xhttpStatus,
      tcpStatus: node.tcpStatus,
      xhttpLatencyMs: node.xhttpLatencyMs,
      tcpLatencyMs: node.tcpLatencyMs,
      usersOnline: node.usersOnline,
      xrayUptimeSeconds: safeNumber(node.xrayUptimeSeconds),
      loadOne: node.loadOne,
      memoryUsedBytes: safeNumber(node.memoryUsedBytes),
      memoryTotalBytes: safeNumber(node.memoryTotalBytes),
      rxBytesPerSecond: node.rxBytesPerSecond,
      txBytesPerSecond: node.txBytesPerSecond,
      xrayVersion: node.xrayVersion,
      nodeVersion: node.nodeVersion,
      lastCheckedAt: node.lastCheckedAt?.toISOString() ?? null,
      lastHealthyAt: node.lastHealthyAt?.toISOString() ?? null,
      lastError: node.lastError,
      latencySeries: (series.get(node.nodeUuid) ?? []).reverse(),
    })),
    incidents: incidents.map((incident) => ({
      id: incident.id,
      nodeName: incident.nodeName,
      type: incident.type,
      status: incident.status,
      title: incident.title,
      message: incident.message,
      occurrences: incident.occurrences,
      openedAt: incident.openedAt.toISOString(),
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    })),
  }
}

export type WatchReport = Awaited<ReturnType<typeof getWatchReport>>

async function cleanupWatchHistory(retentionDays: number) {
  const before = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  await prisma.watchProbe.deleteMany({ where: { checkedAt: { lt: before } } })
}

function nextCounters(status: WatchProbeStatus, failures = 0, successes = 0) {
  if (status === 'FAIL') return { failures: failures + 1, successes: 0 }
  if (status === 'OK') return { failures: 0, successes: successes + 1 }
  return { failures, successes }
}

function counterFields(
  api: ReturnType<typeof nextCounters>,
  xhttp: ReturnType<typeof nextCounters>,
  tcp: ReturnType<typeof nextCounters>
) {
  return {
    apiConsecutiveFailures: api.failures,
    apiConsecutiveSuccesses: api.successes,
    xhttpConsecutiveFailures: xhttp.failures,
    xhttpConsecutiveSuccesses: xhttp.successes,
    tcpConsecutiveFailures: tcp.failures,
    tcpConsecutiveSuccesses: tcp.successes,
  }
}

function readNodeMetrics(node: RemnawaveNode) {
  const stats = node.system?.stats
  return {
    usersOnline: Number(node.usersOnline || 0),
    xrayUptimeSeconds: bigintOrNull(node.xrayUptime),
    loadOne: numberOrNull(stats?.loadAvg?.[0]),
    memoryUsedBytes: bigintOrNull(stats?.memoryUsed),
    memoryTotalBytes: bigintOrNull(node.system?.info?.memoryTotal),
    rxBytesPerSecond: numberOrNull(stats?.interface?.rxBytesPerSec),
    txBytesPerSecond: numberOrNull(stats?.interface?.txBytesPerSec),
    xrayVersion: node.versions?.xray || null,
    nodeVersion: node.versions?.node || null,
  }
}

function probeMetrics(metrics: ReturnType<typeof readNodeMetrics>) {
  return {
    usersOnline: metrics.usersOnline,
    loadOne: metrics.loadOne,
    memoryUsedBytes: metrics.memoryUsedBytes,
    memoryTotalBytes: metrics.memoryTotalBytes,
    rxBytesPerSecond: metrics.rxBytesPerSecond,
    txBytesPerSecond: metrics.txBytesPerSecond,
  }
}

function bigintOrNull(value: number | string | undefined) {
  if (value == null || value === '') return null
  try { return BigInt(Math.round(Number(value))) } catch { return null }
}

function numberOrNull(value: number | string | undefined) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function safeNumber(value: bigint | null) {
  if (value == null) return null
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) ? numeric : Number.MAX_SAFE_INTEGER
}

function averageLatency(left: number | null, right: number | null) {
  const values = [left, right].filter((value): value is number => value != null)
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

function incidentLabel(type: WatchIncidentType) {
  if (type === 'NODE_API') return 'Node API'
  if (type === 'XHTTP') return 'XHTTP Reality'
  if (type === 'REALITY_TCP') return 'TCP Reality'
  return 'Panel API'
}

function toAlert(incident: { id: string; type: WatchIncidentType; nodeName: string | null; title: string; message: string }, kind: 'OPEN' | 'RESOLVED'): WatchAlertEvent {
  return { id: incident.id, kind, type: incident.type, nodeName: incident.nodeName, title: incident.title, message: incident.message }
}

function compactError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 500)
}
