import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { resendVerificationSchema } from '@/lib/auth/validation'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security'
import { createEmailVerificationToken, sendEmailVerificationLink } from '@/lib/email-verification'
import { sanitizeInternalNext } from '@/lib/auth/next-path'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return jsonResponse({ error: 'Invalid request origin' }, { status: 403 })
  }

  const limited = await rateLimit(req, 'auth-resend-verification', 3, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = resendVerificationSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, name: true, emailVerifiedAt: true },
  })

  if (!user || user.emailVerifiedAt) {
    return jsonResponse({ ok: true })
  }

  const token = await createEmailVerificationToken(user.id)
  const delivery = await sendEmailVerificationLink({
    email: user.email,
    name: user.name,
    token,
    next: sanitizeInternalNext(parsed.data.next),
  })

  return jsonResponse({
    ok: true,
    emailDelivery: delivery.sent ? 'sent' : delivery.reason,
  })
}
