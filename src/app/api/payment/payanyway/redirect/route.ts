import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { getAppUrl } from '@/lib/app-url'
import { logInfo } from '@/lib/logger'
import { createPayAnyWayPaymentRequest } from '@/lib/payanyway'
import { buildPaymentServiceName } from '@/lib/payment-service-name'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const paymentIdSchema = z.string().trim().min(1).max(100)

export const GET = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const paymentId = paymentIdSchema.safeParse(new URL(req.url).searchParams.get('payment'))
  if (!paymentId.success) {
    return NextResponse.json({ error: 'Некорректный платёж' }, { status: 400 })
  }

  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId.data,
      userId: session.uid,
      provider: 'PAYANYWAY',
      status: 'PENDING',
    },
    include: { plan: { select: { durationDays: true } } },
  })
  if (!payment) {
    return NextResponse.json({ error: 'Платёж не найден или уже завершён' }, { status: 404 })
  }

  const baseUrl = getAppUrl()
  const request = await createPayAnyWayPaymentRequest({
    transactionId: payment.id,
    amountKopecks: payment.amountKopecks,
    description: buildPaymentServiceName(payment.plan.durationDays),
    subscriberId: session.email,
    successUrl: `${baseUrl}/dashboard/billing?paid=1&payment=${payment.id}`,
    failUrl: `${baseUrl}/dashboard/billing?payment=${payment.id}&failed=1`,
    returnUrl: `${baseUrl}/dashboard/billing?payment=${payment.id}`,
  })

  logInfo('payment.payanyway.form_prepared', {
    paymentId: payment.id,
    merchantId: request.fields.MNT_ID,
    amount: request.fields.MNT_AMOUNT,
    subscriberType: 'email',
    testMode: request.fields.MNT_TEST_MODE,
    configSource: request.diagnostics.source,
    integrityLength: request.diagnostics.secretLength,
    integrityFingerprint: request.diagnostics.secretFingerprint,
    payloadFingerprint: request.diagnostics.payloadFingerprint,
    submissionMethod: 'POST',
  })

  const nonce = randomBytes(18).toString('base64')
  const actionOrigin = new URL(request.action).origin
  return new NextResponse(renderAutoSubmitForm(request.action, request.fields, nonce), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Security-Policy': [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        "style-src 'unsafe-inline'",
        `form-action ${actionOrigin}`,
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

function renderAutoSubmitForm(action: string, fields: Record<string, string>, nonce: string) {
  const inputs = Object.entries(fields)
    .map(([name, value]) => (
      `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`
    ))
    .join('\n')

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Переход к оплате</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
    main { text-align: center; padding: 24px; }
    button { margin-top: 16px; padding: 12px 18px; border: 0; border-radius: 12px; background: #0f172a; color: white; font: inherit; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <p>Переходим к безопасной оплате...</p>
    <form id="payanyway-form" method="post" action="${escapeHtml(action)}">
      ${inputs}
      <noscript><button type="submit">Перейти к оплате</button></noscript>
    </form>
  </main>
  <script nonce="${escapeHtml(nonce)}">document.getElementById('payanyway-form').submit()</script>
</body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
