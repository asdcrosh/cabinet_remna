import { NextResponse } from 'next/server'
import { resetPasswordSchema } from '@/lib/auth/validation'
import { rateLimit } from '@/lib/rate-limit'
import { resetPasswordByToken } from '@/lib/password-reset'
import { assertSameOrigin } from '@/lib/security'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const limited = await rateLimit(req, 'reset-password', 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = resetPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const result = await resetPasswordByToken(parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: 'Ссылка недействительна или истекла' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
