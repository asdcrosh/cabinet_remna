import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { remnawave, RemnawaveError } from '@/lib/remnawave'

export const runtime = 'nodejs'

export const DELETE = withAuth(async (_req: Request, { params }: { params: Promise<{ hwid: string }> }) => {
  const session = await requireAuth()
  const { hwid: rawHwid } = await params
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user?.remnawaveUuid) {
    return NextResponse.json({ error: 'Нет активной подписки' }, { status: 404 })
  }

  const hwid = decodeURIComponent(rawHwid)
  if (!hwid) {
    return NextResponse.json({ error: 'Не выбрано устройство' }, { status: 400 })
  }

  try {
    await remnawave.deleteUserDevice(user.remnawaveUuid, hwid)
    await prisma.device.deleteMany({ where: { userId: user.id, hwid } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return NextResponse.json(
        { error: 'Не удалось отвязать устройство. Попробуйте позже.' },
        { status: 502 }
      )
    }
    throw e
  }
})
