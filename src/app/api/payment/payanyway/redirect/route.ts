import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { getAppUrl } from '@/lib/app-url'
import { logInfo } from '@/lib/logger'
import { createPayAnyWayPaymentRequest } from '@/lib/payanyway'
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
    include: { plan: { select: { name: true, durationDays: true } } },
  })
  if (!payment) {
    return NextResponse.json({ error: 'Платёж не найден или уже завершён' }, { status: 404 })
  }

  const baseUrl = getAppUrl()
  const request = await createPayAnyWayPaymentRequest({
    transactionId: payment.id,
    amountKopecks: payment.amountKopecks,
    description: `Подписка: ${payment.plan.name} (${payment.plan.durationDays} дн.)`,
    successUrl: `${baseUrl}/dashboard/billing?paid=1&payment=${payment.id}`,
    failUrl: `${baseUrl}/dashboard/billing?payment=${payment.id}&failed=1`,
    returnUrl: `${baseUrl}/dashboard/billing?payment=${payment.id}`,
  })

  logInfo('payment.payanyway.form_prepared', {
    paymentId: payment.id,
    merchantId: request.fields.MNT_ID,
    amount: request.fields.MNT_AMOUNT,
    subscriberId: request.fields.MNT_SUBSCRIBER_ID || 'not_sent',
    testMode: request.fields.MNT_TEST_MODE || '0',
    testModeFieldSent: Boolean(request.fields.MNT_TEST_MODE),
    configSource: request.diagnostics.source,
    integrityLength: request.diagnostics.secretLength,
    integrityFingerprint: request.diagnostics.secretFingerprint,
    payloadFingerprint: request.diagnostics.payloadFingerprint,
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
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('')

  return `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Переход к оплате</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a;font:16px system-ui,sans-serif}.box{text-align:center;padding:32px}.spinner{width:32px;height:32px;margin:0 auto 18px;border:3px solid #cbd5e1;border-top-color:#06b6d4;border-radius:50%;animation:s .8s linear infinite}button{margin-top:18px;padding:12px 18px;border:0;border-radius:12px;background:#0f172a;color:white;font:inherit;font-weight:600}@keyframes s{to{transform:rotate(360deg)}}</style></head>
<body><div class="box"><div class="spinner"></div><div>Переходим к безопасной оплате…</div>
<form id="payment-form" method="post" action="${escapeHtml(action)}">${inputs}<button type="submit">Продолжить</button></form></div>
<script nonce="${nonce}">document.getElementById('payment-form').submit()</script></body></html>`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character)
}
