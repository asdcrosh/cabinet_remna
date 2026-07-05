import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { syncCabinetPaymentToRemnashop } from '@/lib/remnashop-reverse-sync'
import { writeAuditLog } from '@/lib/audit-log'
import { describeSyncError } from '@/lib/sync-error'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAdmin()

  const body = (await req.json().catch(() => null)) as { paymentId?: unknown } | null
  const paymentId = typeof body?.paymentId === 'string' ? body.paymentId : null
  if (!paymentId) return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })

  try {
    const result = await syncCabinetPaymentToRemnashop(paymentId)
    await writeAuditLog({
      actorId: session.uid,
      targetId: paymentId,
      action: 'PAYMENT_SYNCED',
      message: 'Администратор повторил синхронизацию платежа в Remnashop',
      metadata: {
        paymentId,
        ok: result.ok,
        skipped: 'skipped' in result ? result.skipped : undefined,
      },
      request: req,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: describeSyncError(new Error('skipped' in result ? result.skipped : 'Remnashop sync failed')) },
        { status: 409 }
      )
    }

    return NextResponse.json({ ok: true, result })
  } catch (error) {
    return NextResponse.json({ error: describeSyncError(error) }, { status: 500 })
  }
})
