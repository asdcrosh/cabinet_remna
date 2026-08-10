import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { getNotificationPreferences, updateNotificationPreferences } from '@/lib/notification-preferences'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  inAppEnabled: z.boolean(),
  telegramEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  broadcastsEnabled: z.boolean(),
}).strict()

export const GET = withAuth(async () => {
  const session = await requireAuth()
  return NextResponse.json({ preferences: await getNotificationPreferences(session.uid) })
})

export const PATCH = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные настройки уведомлений' }, { status: 422 })
  }
  const preferences = await updateNotificationPreferences(session.uid, parsed.data)
  return NextResponse.json({ preferences })
})
