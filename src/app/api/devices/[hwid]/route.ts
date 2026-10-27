import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
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
  const { hwid: rawHwid } = await params
  const hwid = decodeURIComponent(rawHwid)
  if (!hwid) return jsonResponse({ error: 'Не выбрано устройство' }, { status: 400 })

  const { displayName } = parsed.data
  const result = await prisma.device.updateMany({
    where: { userId: session.uid, hwid },
    data: { displayName },
  })
  if (result.count === 0) return jsonResponse({ error: 'Устройство не найдено' }, { status: 404 })
  return jsonResponse({ ok: true, displayName })
})

// Older open clients may still send DELETE after the controls have been removed.
export const DELETE = withAuth(async () => {
  await requireAuth()
  return jsonResponse({ error: 'Блокировка устройств отключена' }, { status: 410 })
})
