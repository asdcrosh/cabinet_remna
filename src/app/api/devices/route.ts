// GET /api/devices — список HWID-устройств пользователя из Remnawave.
// Успешный ответ кэшируем в локальную БД, чтобы в админке были счетчики устройств.

import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { hasRemnawaveUserReference, RemnawaveError, remnawaveUserReference } from '@/lib/remnawave'
import { syncLocalDevicesFromRemnawave } from '@/lib/remnawave-device-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user || !hasRemnawaveUserReference(user)) return jsonResponse({ devices: [], blockedDevices: [] })

  try {
    const { devices, blockedDevices } = await syncLocalDevicesFromRemnawave({
      localUserId: user.id,
      reference: remnawaveUserReference(user),
    })
    return jsonResponse({ devices, blockedDevices })
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return jsonResponse(
        { devices: [], blockedDevices: [], error: 'Не удалось загрузить устройства. Попробуйте позже.' },
        { status: 200 }
      )
    }
    throw e
  }
})

export const DELETE = withAuth(async () => {
  await requireAuth()
  return jsonResponse({ error: 'Блокировка устройств отключена' }, { status: 410 })
})
