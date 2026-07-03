import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { remnawave, RemnawaveError } from '@/lib/remnawave'

export const runtime = 'nodejs'

export const POST = withAuth(async (_req: Request, { params }: { params: { hwid: string } }) => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  const hwid = decodeURIComponent(params.hwid)

  if (!hwid) {
    return NextResponse.json({ error: 'Не выбрано устройство' }, { status: 400 })
  }

  if (user?.remnawaveUuid) {
    try {
      await remnawave.deleteUserDevice(user.remnawaveUuid, hwid)
    } catch (error) {
      if (!(error instanceof RemnawaveError && error.status === 404)) {
        if (error instanceof RemnawaveError) {
          return NextResponse.json(
            { error: 'Не удалось удалить устройство в Remnawave. Попробуйте позже.' },
            { status: 502 }
          )
        }
        throw error
      }
    }
  }

  const blockedDevice = await prisma.blockedDevice.upsert({
    where: { userId_hwid: { userId: session.uid, hwid } },
    create: {
      userId: session.uid,
      hwid,
      reason: 'Заблокировано пользователем',
    },
    update: {
      reason: 'Заблокировано пользователем',
      blockedAt: new Date(),
      unblockedAt: null,
    },
  })

  await prisma.device.deleteMany({ where: { userId: session.uid, hwid } })

  return NextResponse.json({
    ok: true,
    blockedDevice: {
      hwid: blockedDevice.hwid,
      reason: blockedDevice.reason,
      blockedAt: blockedDevice.blockedAt.toISOString(),
    },
  })
})

export const DELETE = withAuth(async (_req: Request, { params }: { params: { hwid: string } }) => {
  const session = await requireAuth()
  const hwid = decodeURIComponent(params.hwid)

  if (!hwid) {
    return NextResponse.json({ error: 'Не выбрано устройство' }, { status: 400 })
  }

  await prisma.blockedDevice.updateMany({
    where: {
      userId: session.uid,
      hwid,
      unblockedAt: null,
    },
    data: {
      unblockedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
})
