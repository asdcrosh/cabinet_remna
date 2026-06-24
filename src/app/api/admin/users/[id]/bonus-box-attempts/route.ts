import { NextResponse } from 'next/server'
import { z } from 'zod'
import { BonusBoxError, grantManualBonusBoxAttempts } from '@/lib/bonus-box'
import { requireSuperAdmin, withAuth } from '@/lib/auth/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  attemptsCount: z.coerce.number().int().min(1).max(100),
})

export const POST = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireSuperAdmin()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Укажите количество от 1 до 100' }, { status: 400 })
  }

  try {
    const result = await grantManualBonusBoxAttempts({
      userId: params.id,
      adminId: session.uid,
      attemptsCount: parsed.data.attemptsCount,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BonusBoxError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
})
