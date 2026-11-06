// Push в приложение StealthNet через Firebase Cloud Messaging (HTTP v1).
// Включается переменной FIREBASE_SERVICE_ACCOUNT_BASE64 (ключ сервисного аккаунта в base64).
// Без неё ничего не отправляется: уведомления остаются в центре уведомлений приложения.
import type { NotificationType } from '@prisma/client'
import { importPKCS8, SignJWT } from 'jose'
import { prisma } from './prisma'
import { logError, logWarn } from './logger'

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TIMEOUT_MS = 10_000
/** Канал уведомлений приложения (создаётся в MainActivity). */
export const PUSH_CHANNEL_ID = 'stealthnet_alerts'

export type PushCategory = 'subscription' | 'payments' | 'news' | 'security'

/** Какой переключатель в настройках приложения управляет уведомлением этого типа. */
export function pushCategory(type: NotificationType): PushCategory {
  switch (type) {
    case 'SUBSCRIPTION_EXPIRING':
    case 'SUBSCRIPTION_TERMINATED':
    case 'SUBSCRIPTION_PAUSED':
    case 'SUBSCRIPTION_RESUMED':
    case 'WHITELIST_ADDON_EXPIRING':
    case 'TRAFFIC_LIMIT':
      return 'subscription'
    case 'PAYMENT_SUCCESS':
    case 'PAYMENT_FAILED':
    case 'PAYMENT_STUCK':
    case 'SUPPORT_REPLY':
      return 'payments'
    case 'BROADCAST':
    case 'BONUS_GRANTED':
      return 'news'
    case 'ACCOUNT_SECURITY':
      return 'security'
  }
}

type ServiceAccount = { project_id: string; client_email: string; private_key: string }

export function readServiceAccount(raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64): ServiceAccount | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'))
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null
    return parsed as ServiceAccount
  } catch {
    return null
  }
}

let cachedAccess: { token: string; expiresAt: number; email: string } | null = null

/** OAuth-токен Google для FCM по ключу сервисного аккаунта (кэш до истечения). */
async function accessToken(account: ServiceAccount, fetchImpl: typeof fetch): Promise<string> {
  const now = Date.now()
  if (cachedAccess && cachedAccess.email === account.client_email && cachedAccess.expiresAt - 60_000 > now) {
    return cachedAccess.token
  }
  const key = await importPKCS8(account.private_key, 'RS256')
  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key)
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Google OAuth ${response.status}`)
  const body = await response.json() as { access_token: string; expires_in: number }
  cachedAccess = { token: body.access_token, expiresAt: now + body.expires_in * 1000, email: account.client_email }
  return body.access_token
}

export function resetPushAccessTokenCache() {
  cachedAccess = null
}

export type PushInput = {
  userId: string
  type: NotificationType
  title: string
  body: string
  actionHref?: string | null
}

/**
 * Отправить push на телефоны пользователя с действующей сессией приложения и включённой
 * категорией. Никогда не бросает: ошибка доставки не должна ломать сценарий кабинета.
 * Токены, которые Firebase больше не принимает, удаляются.
 */
export async function sendPushToUser(input: PushInput, fetchImpl: typeof fetch = fetch): Promise<number> {
  const account = readServiceAccount()
  if (!account) return 0
  try {
    const category = pushCategory(input.type)
    const tokens = await prisma.mobilePushToken.findMany({
      where: {
        userId: input.userId,
        mobileSession: { revokedAt: null, expiresAt: { gt: new Date() } },
        ...(category === 'subscription' ? { subscriptionAlerts: true } : {}),
        ...(category === 'payments' ? { paymentAlerts: true } : {}),
        ...(category === 'news' ? { newsAlerts: true } : {}),
      },
      select: { id: true, token: true },
    })
    if (tokens.length === 0) return 0

    const access = await accessToken(account, fetchImpl)
    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`
    let sent = 0
    const dead: string[] = []
    await Promise.all(tokens.map(async ({ id, token }) => {
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: input.title, body: input.body },
              data: { type: input.type, ...(input.actionHref ? { actionHref: input.actionHref } : {}) },
              android: {
                priority: 'HIGH',
                notification: { channel_id: PUSH_CHANNEL_ID },
              },
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (response.ok) {
          sent++
          return
        }
        const text = await response.text().catch(() => '')
        // Токен удалён на телефоне или выдан другому проекту — больше не пытаемся.
        if (response.status === 404 || /UNREGISTERED|SENDER_ID_MISMATCH/.test(text)) {
          dead.push(id)
          return
        }
        logWarn('push.send_failed', { status: response.status, type: input.type })
      } catch (error) {
        logWarn('push.send_error', { type: input.type, error: error instanceof Error ? error.message : String(error) })
      }
    }))
    if (dead.length > 0) await prisma.mobilePushToken.deleteMany({ where: { id: { in: dead } } })
    return sent
  } catch (error) {
    logError('push.unavailable', error, { type: input.type })
    return 0
  }
}
