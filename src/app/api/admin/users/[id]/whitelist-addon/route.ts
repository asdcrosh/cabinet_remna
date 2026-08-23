import { NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit-log'
import { requireSuperAdmin, withAuth } from '@/lib/auth/guard'
import {
  grantWhitelistAddonManually,
  revokeWhitelistAddonManually,
  WhitelistAddonManagementError,
} from '@/lib/whitelist-addon'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict()

export const PUT = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSuperAdmin()
  const { id: userId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Укажите дату окончания БС' }, { status: 422 })
  }

  const expireAt = new Date(`${parsed.data.expiresOn}T23:59:59.999+03:00`)
  try {
    const result = await grantWhitelistAddonManually({ userId, expireAt })
    await writeAuditLog({
      actorId: session.uid,
      targetId: userId,
      action: 'ADMIN_FEATURES_UPDATED',
      message: 'Главный администратор вручную выдал доступ к БС',
      metadata: { subscriptionId: result.subscription.id, expireAt: expireAt.toISOString() },
      request: req,
    })
    return NextResponse.json({
      whitelistAddon: {
        active: true,
        expireAt: result.subscription.whitelistAddonExpireAt,
      },
    })
  } catch (error) {
    if (error instanceof WhitelistAddonManagementError) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    throw error
  }
})

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSuperAdmin()
  const { id: userId } = await params
  try {
    const result = await revokeWhitelistAddonManually(userId)
    await writeAuditLog({
      actorId: session.uid,
      targetId: userId,
      action: 'ADMIN_FEATURES_UPDATED',
      message: 'Главный администратор вручную снял доступ к БС',
      metadata: { revoked: result.revoked },
      request: req,
    })
    return NextResponse.json({ whitelistAddon: { active: false, expireAt: null } })
  } catch (error) {
    if (error instanceof WhitelistAddonManagementError) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    throw error
  }
})
