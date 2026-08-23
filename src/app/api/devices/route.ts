// GET /api/devices — список HWID-устройств пользователя из Remnawave.
// Успешный ответ кэшируем в локальную БД, чтобы в админке были счетчики устройств.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { hasRemnawaveUserReference, remnawave, RemnawaveError, remnawaveUserReference } from '@/lib/remnawave'
import { syncLocalDevicesFromRemnawave } from '@/lib/remnawave-device-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user || !hasRemnawaveUserReference(user)) return NextResponse.json({ devices: [], blockedDevices: [] })

  try {
    const { devices, blockedDevices } = await syncLocalDevicesFromRemnawave({
      localUserId: user.id,
      reference: remnawaveUserReference(user),
    })
    return NextResponse.json({ devices, blockedDevices })
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return NextResponse.json(
        { devices: [], blockedDevices: [], error: 'Не удалось загрузить устройства. Попробуйте позже.' },
        { status: 200 }
      )
    }
    throw e
  }
})

export const DELETE = withAuth(async () => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user || !hasRemnawaveUserReference(user)) {
    return NextResponse.json({ error: 'Нет активной подписки' }, { status: 404 })
  }

  try {
    await remnawave.deleteAllUserDevices(remnawaveUserReference(user))
    const result = await prisma.device.updateMany({
      where: { userId: user.id, blockedAt: null },
      data: { blockedAt: new Date() },
    })
    return NextResponse.json({ ok: true, blocked: result.count })
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return NextResponse.json(
        { error: 'Не удалось заблокировать устройства. Попробуйте позже.' },
        { status: 502 }
      )
    }
    throw e
  }
})
