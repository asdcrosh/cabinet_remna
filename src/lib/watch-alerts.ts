import { prisma } from './prisma'
import { createAdminNotification } from './admin-notifications'
import { getBrandName } from './branding'
import { getWatchConfig } from './watch-config'
import { logError, logWarn } from './logger'

export type WatchAlertEvent = {
  id: string
  kind: 'OPEN' | 'RESOLVED'
  type: 'PANEL_API' | 'NODE_API' | 'XHTTP' | 'REALITY_TCP'
  nodeUuid: string | null
  nodeName: string | null
  title: string
  message: string
}

export async function sendWatchAlerts(events: WatchAlertEvent[]) {
  for (const group of groupAlertEvents(events)) {
    if (!await shouldNotify(group)) continue
    await sendAlertGroup(group)
  }
}

export async function sendWatchAlert(event: WatchAlertEvent) {
  await sendWatchAlerts([event])
}

export function groupAlertEvents(events: WatchAlertEvent[]) {
  const groups = new Map<string, WatchAlertEvent[]>()
  for (const event of events) {
    const key = `${event.kind}:${event.nodeUuid || 'panel'}`
    groups.set(key, [...(groups.get(key) ?? []), event])
  }
  return [...groups.values()]
}

async function shouldNotify(events: WatchAlertEvent[]) {
  const first = events[0]
  if (!first) return false

  if (first.kind === 'OPEN') {
    const existingOpen = await prisma.watchIncident.count({
      where: {
        nodeUuid: first.nodeUuid,
        status: 'OPEN',
        id: { notIn: events.map((event) => event.id) },
      },
    })
    return existingOpen === 0
  }

  const remainingOpen = await prisma.watchIncident.count({
    where: { nodeUuid: first.nodeUuid, status: 'OPEN' },
  })
  return remainingOpen === 0
}

async function sendAlertGroup(events: WatchAlertEvent[]) {
  const first = events[0]
  if (!first) return
  const isOpen = first.kind === 'OPEN'
  const nodeName = first.nodeName || 'Remnawave Panel'
  const channels = [...new Set(events.map((event) => typeLabel(event.type)))]
  const messages = [...new Set(events.map((event) => event.message).filter(Boolean))]
  const title = isOpen
    ? `${nodeName}: проблема подтверждена`
    : `${nodeName}: работа восстановлена`
  const body = isOpen
    ? `Не отвечают: ${channels.join(', ')}. ${messages.join(' ')}`
    : `Стабильность подтверждена. Восстановлены: ${channels.join(', ')}.`
  const incidentIds = events.map((event) => event.id).sort()

  await createAdminNotification({
    type: isOpen ? 'WATCH_INCIDENT_OPEN' : 'WATCH_INCIDENT_RESOLVED',
    severity: isOpen ? 'ERROR' : 'SUCCESS',
    dedupeKey: `watch:summary:${first.kind.toLowerCase()}:${incidentIds.join(':')}`,
    title,
    body,
    entityType: 'watch-incident',
    entityId: first.id,
    actionHref: '/dashboard/admin/watch',
    actionLabel: 'Открыть Watch',
  })

  const config = getWatchConfig()
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token || !config.telegramChatId) {
    logWarn('watch.telegram_not_configured', {
      hasBotToken: Boolean(token),
      hasChatId: Boolean(config.telegramChatId),
    })
    return
  }

  const brand = getBrandName()
  const appUrl = process.env.APP_URL?.replace(/\/$/, '')
  const lines = [
    isOpen ? '<b>Проблема подтверждена</b>' : '<b>Работа восстановлена</b>',
    `<b>${escapeHtml(brand)} Watch</b>`,
    first.nodeName ? `Нода: <b>${escapeHtml(first.nodeName)}</b>` : null,
    `Каналы: ${escapeHtml(channels.join(', '))}`,
    escapeHtml(body),
    isOpen
      ? `Подтверждение: ${config.failureThreshold} циклов подряд, по ${config.probeAttempts} попытки на канал.`
      : `Восстановление: ${config.recoveryThreshold} успешных циклов подряд.`,
    appUrl ? `<a href="${escapeHtml(`${appUrl}/dashboard/admin/watch`)}">Открыть Watch</a>` : null,
  ].filter(Boolean)

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      logWarn('watch.telegram_failed', { status: response.status, incidentIds })
    }
  } catch (error) {
    logError('watch.telegram_failed', error, { incidentIds })
  }
}

function typeLabel(type: WatchAlertEvent['type']) {
  if (type === 'PANEL_API') return 'Panel API'
  if (type === 'NODE_API') return 'Node API'
  if (type === 'XHTTP') return 'XHTTP Reality'
  return 'TCP Reality'
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char] || char)
}
