// GET /api/devices — список HWID-устройств пользователя из Remnawave.
// Успешный ответ кэшируем в локальную БД, чтобы в админке были счетчики устройств.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { RemnawaveError } from '@/lib/remnawave'
import { syncLocalDevicesFromRemnawave } from '@/lib/remnawave-device-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user?.remnawaveUuid) return NextResponse.json({ devices: [] })

  try {
    const { devices } = await syncLocalDevicesFromRemnawave({
      localUserId: user.id,
      remnawaveUuid: user.remnawaveUuid,
    })
    return NextResponse.json({ devices })
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return NextResponse.json(
        { devices: [], error: 'Не удалось загрузить устройства. Попробуйте позже.' },
        { status: 200 }
      )
    }
    throw e
  }
})
