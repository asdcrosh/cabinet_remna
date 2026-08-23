import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import {
  hasRemnawaveUserReference,
  remnawave,
  RemnawaveError,
  remnawaveUserReference,
} from '@/lib/remnawave'
import { z } from 'zod'

export const runtime = 'nodejs'

const renameDeviceSchema = z.object({
  displayName: z.string().trim().min(1).max(40).nullable(),
})

export const PATCH = withAuth(async (req: Request, { params }: { params: Promise<{ hwid: string }> }) => {
  const session = await requireAuth()
  const parsed = renameDeviceSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Название должно содержать от 1 до 40 символов' }, { status: 400 })
  }
  const { hwid: rawHwid } = await params
  const hwid = decodeURIComponent(rawHwid)
  if (!hwid) return NextResponse.json({ error: 'Не выбрано устройство' }, { status: 400 })

  const result = await prisma.device.updateMany({
    where: { userId: session.uid, hwid },
    data: { displayName: parsed.data.displayName },
  })
  if (result.count === 0) return NextResponse.json({ error: 'Устройство не найдено' }, { status: 404 })
  return NextResponse.json({ ok: true, displayName: parsed.data.displayName })
})

export const DELETE = withAuth(async (_req: Request, { params }: { params: Promise<{ hwid: string }> }) => {
  const session = await requireAuth()
  const { hwid: rawHwid } = await params
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user || !hasRemnawaveUserReference(user)) {
    return NextResponse.json({ error: 'Нет активной подписки' }, { status: 404 })
  }

  const hwid = decodeURIComponent(rawHwid)
  if (!hwid) {
    return NextResponse.json({ error: 'Не выбрано устройство' }, { status: 400 })
  }

  try {
    await remnawave.deleteUserDevice(remnawaveUserReference(user), hwid)
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
