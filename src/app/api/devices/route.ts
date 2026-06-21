// GET /api/devices — список HWID-устройств пользователя из Remnawave.
// Успешный ответ кэшируем в локальную БД, чтобы в админке были счетчики устройств.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { remnawave, RemnawaveError } from '@/lib/remnawave'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user?.remnawaveUuid) return NextResponse.json({ devices: [] })

  try {
    const data = await remnawave.getUserDevices(user.remnawaveUuid)
    const devices = data.response.devices.map((device) => ({
      hwid: device.hwid,
      platform: device.platform ?? null,
      osVersion: device.osVersion ?? null,
      deviceModel: device.deviceModel ?? null,
      userAgent: device.userAgent ?? null,
      ip: device.requestIp ?? null,
      createdAt: device.createdAt ?? null,
      updatedAt: device.updatedAt ?? null,
    }))

    // Кэшируем в локальную БД для будущей логики
    await Promise.all(
      devices.map((d) =>
        prisma.device.upsert({
          where: { userId_hwid: { userId: user.id, hwid: d.hwid } },
          create: {
            userId: user.id,
            hwid: d.hwid,
            platform: d.platform,
            userAgent: d.userAgent,
            ip: d.ip,
          },
          update: {
            platform: d.platform,
            userAgent: d.userAgent,
            ip: d.ip,
            lastSeenAt: d.updatedAt ? new Date(d.updatedAt) : new Date(),
          },
        })
      )
    )
    await prisma.device.deleteMany({
      where: {
        userId: user.id,
        hwid: { notIn: devices.map((device) => device.hwid) },
      },
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
