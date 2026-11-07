// PUT /api/mobile/push-token — приложение StealthNet сообщает свой push-токен Firebase и
// какие уведомления присылать (переключатели «Уведомления» в настройках приложения).
// DELETE — перестать присылать push на этот телефон (выход, отключение).
// Только для сессии приложения: токен привязывается к ней и пропадает при её отзыве.
import { z } from 'zod'
import { jsonResponse } from '@/lib/json-response'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { isMobileSession } from '@/lib/auth/jwt'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const putSchema = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(['android']).default('android'),
  subscription: z.boolean(),
  payments: z.boolean(),
  news: z.boolean(),
}).strict()

const deleteSchema = z.object({ token: z.string().trim().min(20).max(4096) }).strict()

export const PUT = withAuth(async (req: Request) => {
  const session = await requireAuth()
  if (!isMobileSession(session)) {
    return jsonResponse({ error: 'Только для приложения StealthNet' }, { status: 403 })
  }
  const limited = await rateLimit(req, `mobile-push-token:${session.uid}`, 20, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }
  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Некорректный push-токен' }, { status: 400 })

  const { token, platform, subscription, payments, news } = parsed.data
  const data = {
    userId: session.uid,
    mobileSessionId: session.sid!,
    platform,
    subscriptionAlerts: subscription,
    paymentAlerts: payments,
    newsAlerts: news,
  }
  // Тот же токен после повторного входа (или другим аккаунтом) переходит к текущей сессии.
  await prisma.mobilePushToken.upsert({
    where: { token },
    create: { token, ...data },
    update: data,
  })
  // У сессии один телефон — старые токены этой сессии больше не нужны.
  await prisma.mobilePushToken.deleteMany({
    where: { mobileSessionId: session.sid!, token: { not: token } },
  })
  return jsonResponse({ ok: true })
})

export const DELETE = withAuth(async (req: Request) => {
  const session = await requireAuth()
  if (!isMobileSession(session)) {
    return jsonResponse({ error: 'Только для приложения StealthNet' }, { status: 403 })
  }
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Некорректный push-токен' }, { status: 400 })
  await prisma.mobilePushToken.deleteMany({ where: { token: parsed.data.token, userId: session.uid } })
  return jsonResponse({ ok: true })
})
