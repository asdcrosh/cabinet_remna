import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import { unbindUserDevice } from '@/lib/device-unbind'
import { z } from 'zod'

export const runtime = 'nodejs'

const updateDeviceSchema = z.object({
  displayName: z.string().trim().min(1).max(40).nullable(),
}).strict()

export const PATCH = withAuth(async (req: Request, { params }: { params: Promise<{ hwid: string }> }) => {
  const session = await requireAuth()
  const parsed = updateDeviceSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonResponse({ error: 'Некорректные параметры устройства' }, { status: 400 })
  }
  const { hwid } = await params
  if (!hwid) return jsonResponse({ error: 'Не выбрано устройство' }, { status: 400 })

  const { displayName } = parsed.data
  const result = await prisma.device.updateMany({
    where: { userId: session.uid, hwid },
    data: { displayName },
  })
  if (result.count === 0) return jsonResponse({ error: 'Устройство не найдено' }, { status: 404 })
  return jsonResponse({ ok: true, displayName })
})

// DELETE /api/devices/:hwid — отвязать устройство: HWID удаляется из Remnawave, место в лимите
// освобождается. Вход в приложение StealthNet на этом устройстве (сессии с тем же HWID)
// отзывается сразу. Это не блокировка: устройство может подключиться снова, если есть место.
export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ hwid: string }> }) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `devices:unbind:${session.uid}`, 10, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const { hwid } = await params
  if (!hwid || hwid.length > 256) return jsonResponse({ error: 'Не выбрано устройство' }, { status: 400 })

  const result = await unbindUserDevice({ userId: session.uid, hwid, request: req })
  if (!result.ok && result.error === 'NOT_FOUND') {
    return jsonResponse({ error: 'Устройство не найдено' }, { status: 404 })
  }
  if (!result.ok) {
    return jsonResponse({ error: 'Не удалось отвязать устройство. Попробуйте позже.' }, { status: 502 })
  }
  return jsonResponse({ ok: true, revokedSessions: result.revokedSessions })
})
