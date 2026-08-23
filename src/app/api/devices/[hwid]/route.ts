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

const updateDeviceSchema = z.union([
  z.object({ displayName: z.string().trim().min(1).max(40).nullable() }).strict(),
  z.object({ blocked: z.literal(false) }).strict(),
])

export const PATCH = withAuth(async (req: Request, { params }: { params: Promise<{ hwid: string }> }) => {
  const session = await requireAuth()
  const parsed = updateDeviceSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные параметры устройства' }, { status: 400 })
  }
  const { hwid: rawHwid } = await params
  const hwid = decodeURIComponent(rawHwid)
  if (!hwid) return NextResponse.json({ error: 'Не выбрано устройство' }, { status: 400 })

  const displayName = 'displayName' in parsed.data ? parsed.data.displayName : undefined
  const rename = displayName !== undefined
  const result = await prisma.device.updateMany({
    where: { userId: session.uid, hwid },
    data: rename ? { displayName } : { blockedAt: null },
  })
  if (result.count === 0) return NextResponse.json({ error: 'Устройство не найдено' }, { status: 404 })
  return NextResponse.json(rename
    ? { ok: true, displayName }
    : { ok: true, blocked: false })
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
    await prisma.device.upsert({
      where: { userId_hwid: { userId: user.id, hwid } },
      create: { userId: user.id, hwid, blockedAt: new Date() },
      update: { blockedAt: new Date() },
    })
    return NextResponse.json({ ok: true, blocked: true })
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return NextResponse.json(
        { error: 'Не удалось заблокировать устройство. Попробуйте позже.' },
        { status: 502 }
      )
    }
    throw e
  }
})
