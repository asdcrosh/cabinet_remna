// Сессии приложения StealthNet.
//
// Access-токен — JWT кабинета с aud "mobile", sid и сроком 15 минут (signSession).
// Refresh-токен — 32 случайных байта; в базе хранится только SHA-256.
// Каждый refresh выдаёт новую пару. Повторное использование старого refresh
// (prevHash) считается кражей и отзывает сессию целиком.
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit-log'
import { getClientIp } from '@/lib/security'
import { logWarn } from '@/lib/logger'
import { notifyMobileLoginFromNewDevice } from '@/lib/notifications'
import { MOBILE_ACCESS_TTL_SECONDS, signSession, type SessionPayload } from './jwt'

export const MOBILE_REFRESH_TTL_DAYS = 60
const REFRESH_TTL_MS = MOBILE_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000

export const mobileDeviceSchema = z.object({
  hwid: z.string().trim().regex(/^[A-Za-z0-9_-]{8,128}$/, 'Некорректный идентификатор устройства'),
  name: z.string().trim().max(100).optional(),
  platform: z.enum(['android', 'windows', 'ios', 'macos']).optional(),
  appVersion: z.string().trim().max(32).optional(),
})

export type MobileDevice = z.infer<typeof mobileDeviceSchema>

type SessionUser = {
  id: string
  email: string
  role: SessionPayload['role']
}

export type MobileTokens = {
  accessToken: string
  refreshToken: string
  tokenType: 'Bearer'
  expiresIn: number
  sessionId: string
}

export type RotateResult =
  | { ok: true; tokens: MobileTokens; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'reused' | 'device_mismatch' }

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function newRefreshToken() {
  return randomBytes(32).toString('base64url')
}

function refreshExpiry() {
  return new Date(Date.now() + REFRESH_TTL_MS)
}

async function issueAccessToken(user: SessionUser, sessionId: string) {
  return signSession({ uid: user.id, email: user.email, role: user.role }, { mobileSessionId: sessionId })
}

export async function createMobileSession(user: SessionUser, device: MobileDevice, req: Request): Promise<MobileTokens> {
  const owner = await prisma.user.findUnique({ where: { id: user.id }, select: { sessionVersion: true } })
  if (!owner) throw new Error('Cannot create mobile session for missing user')

  // Входили ли раньше с этого устройства — иначе предупреждаем пользователя.
  const knownDevice = await prisma.mobileSession.findFirst({
    where: { userId: user.id, hwid: device.hwid },
    select: { id: true },
  })

  const refreshToken = newRefreshToken()
  const session = await prisma.mobileSession.create({
    data: {
      userId: user.id,
      hwid: device.hwid,
      deviceName: device.name ?? null,
      platform: device.platform ?? null,
      appVersion: device.appVersion ?? null,
      refreshHash: hashRefreshToken(refreshToken),
      sessionVersion: owner.sessionVersion,
      expiresAt: refreshExpiry(),
      ip: getClientIp(req) || null,
      userAgent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
    },
  })

  await writeAuditLog({
    actorId: user.id,
    targetId: user.id,
    action: 'MOBILE_SESSION_CREATED',
    message: `Вход в приложение: ${device.name || device.platform || 'устройство'}`,
    metadata: { sessionId: session.id, platform: device.platform ?? null, appVersion: device.appVersion ?? null },
    request: req,
  })

  if (!knownDevice) {
    // Ошибка доставки уведомления не должна мешать входу.
    await notifyMobileLoginFromNewDevice({
      userId: user.id,
      sessionId: session.id,
      deviceLabel: [device.name, device.platform].filter(Boolean).join(', ') || 'неизвестное устройство',
    }).catch((error: unknown) => {
      logWarn('auth.mobile.new_device_notify_failed', {
        userId: user.id,
        message: error instanceof Error ? error.message : 'unknown error',
      })
    })
  }

  return {
    accessToken: await issueAccessToken(user, session.id),
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: MOBILE_ACCESS_TTL_SECONDS,
    sessionId: session.id,
  }
}

export async function rotateMobileSession(refreshToken: string, hwid: string, req: Request): Promise<RotateResult> {
  const hash = hashRefreshToken(refreshToken)
  const session = await prisma.mobileSession.findUnique({
    where: { refreshHash: hash },
    include: { user: { select: { id: true, email: true, role: true, sessionVersion: true } } },
  })

  if (!session) {
    // Старый refresh пришёл повторно — токен скопирован. Отзываем сессию, где он был предыдущим.
    const stolen = await prisma.mobileSession.findUnique({ where: { prevHash: hash }, select: { id: true, userId: true, revokedAt: true } })
    if (stolen && !stolen.revokedAt) {
      await revokeMobileSessionById(stolen.id, 'refresh_reuse')
      await writeAuditLog({
        actorId: stolen.userId,
        targetId: stolen.userId,
        action: 'MOBILE_REFRESH_REUSE_DETECTED',
        message: 'Повторное использование refresh-токена: сессия приложения отозвана',
        metadata: { sessionId: stolen.id },
        request: req,
      })
      return { ok: false, reason: 'reused' }
    }
    return { ok: false, reason: 'invalid' }
  }

  if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' }
  }
  if (session.user.sessionVersion !== session.sessionVersion) {
    // Пользователь нажал «Завершить все сеансы» — приложение тоже выходит.
    await revokeMobileSessionById(session.id, 'sessions_revoked')
    return { ok: false, reason: 'expired' }
  }
  if (session.hwid !== hwid) {
    await revokeMobileSessionById(session.id, 'device_mismatch')
    await writeAuditLog({
      actorId: session.userId,
      targetId: session.userId,
      action: 'MOBILE_SESSION_REVOKED',
      message: 'Refresh-токен предъявлен с другого устройства: сессия приложения отозвана',
      metadata: { sessionId: session.id },
      request: req,
    })
    return { ok: false, reason: 'device_mismatch' }
  }

  const nextRefresh = newRefreshToken()
  // Условие по старому хэшу защищает от двух одновременных обновлений одним токеном.
  const updated = await prisma.mobileSession.updateMany({
    where: { id: session.id, refreshHash: hash, revokedAt: null },
    data: {
      prevHash: hash,
      refreshHash: hashRefreshToken(nextRefresh),
      lastUsedAt: new Date(),
      expiresAt: refreshExpiry(),
      ip: getClientIp(req) || null,
    },
  })
  if (updated.count !== 1) return { ok: false, reason: 'invalid' }

  return {
    ok: true,
    userId: session.userId,
    tokens: {
      accessToken: await issueAccessToken(session.user, session.id),
      refreshToken: nextRefresh,
      tokenType: 'Bearer',
      expiresIn: MOBILE_ACCESS_TTL_SECONDS,
      sessionId: session.id,
    },
  }
}

export async function revokeMobileSessionById(id: string, reason: string) {
  await prisma.mobileSession.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: reason },
  })
}

/** Выход: по текущей сессии (access) или по refresh-токену, если access уже истёк. */
export async function revokeMobileSession(params: { sessionId?: string; userId?: string; refreshToken?: string }, reason = 'logout') {
  if (params.sessionId && params.userId) {
    const res = await prisma.mobileSession.updateMany({
      where: { id: params.sessionId, userId: params.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    })
    return res.count > 0
  }
  if (params.refreshToken) {
    const res = await prisma.mobileSession.updateMany({
      where: { refreshHash: hashRefreshToken(params.refreshToken), revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    })
    return res.count > 0
  }
  return false
}

/** Активные сессии приложения пользователя — для списка «Где выполнен вход». */
export async function listMobileSessions(userId: string) {
  return prisma.mobileSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
    select: {
      id: true,
      deviceName: true,
      platform: true,
      appVersion: true,
      createdAt: true,
      lastUsedAt: true,
    },
  })
}
