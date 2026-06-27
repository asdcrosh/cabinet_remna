import { NextResponse } from 'next/server'
import { requireStaff, withAuth } from '@/lib/auth/guard'
import { markAdminNotificationRead } from '@/lib/admin-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const PATCH = withAuth(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await requireStaff()
  await markAdminNotificationRead(params.id, session.uid)
  return NextResponse.json({ ok: true })
})
