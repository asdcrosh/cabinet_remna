import { createAdminNotification } from './admin-notifications'
import { getBrandName } from './branding'
import { getWatchConfig } from './watch-config'
import { logError, logWarn } from './logger'

export type WatchAlertEvent = {
  id: string
  kind: 'OPEN' | 'RESOLVED'
  type: 'PANEL_API' | 'NODE_API' | 'XHTTP' | 'REALITY_TCP'
  nodeName: string | null
  title: string
  message: string
}

export async function sendWatchAlert(event: WatchAlertEvent) {
  const brand = getBrandName()
  const isOpen = event.kind === 'OPEN'
  await createAdminNotification({
    type: isOpen ? 'WATCH_INCIDENT_OPEN' : 'WATCH_INCIDENT_RESOLVED',
    severity: isOpen ? 'ERROR' : 'SUCCESS',
    dedupeKey: `watch:${event.id}:${event.kind.toLowerCase()}`,
    title: event.title,
    body: event.message,
    entityType: 'watch-incident',
    entityId: event.id,
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

  const appUrl = process.env.APP_URL?.replace(/\/$/, '')
  const lines = [
    isOpen ? '🔴 <b>Открыт инцидент</b>' : '🟢 <b>Работа восстановлена</b>',
    `<b>${escapeHtml(brand)} Watch</b>`,
    event.nodeName ? `Нода: <b>${escapeHtml(event.nodeName)}</b>` : null,
    `Контур: ${escapeHtml(typeLabel(event.type))}`,
    escapeHtml(event.message),
    appUrl ? `<a href="${escapeHtml(`${appUrl}/dashboard/admin/watch`)}">Открыть пульт</a>` : null,
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
      logWarn('watch.telegram_failed', { status: response.status, incidentId: event.id })
    }
  } catch (error) {
    logError('watch.telegram_failed', error, { incidentId: event.id })
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
