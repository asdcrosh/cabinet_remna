import { NextResponse } from 'next/server'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PROVIDER_TIMEOUT_MS = 15_000

interface EmailWebhookPayload {
  to?: unknown
  subject?: unknown
  text?: unknown
  html?: unknown
}

export async function POST(req: Request) {
  const expectedSecret = process.env.EMAIL_VERIFICATION_WEBHOOK_SECRET?.trim()
  if (!expectedSecret) {
    return NextResponse.json({ error: 'Email webhook secret is not configured' }, { status: 503 })
  }

  const authorization = req.headers.get('authorization') || ''
  if (authorization !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.EMAIL_FROM?.trim()
  if (!apiKey || !from) {
    return NextResponse.json({ error: 'Email provider is not configured' }, { status: 503 })
  }

  let payload: EmailWebhookPayload
  try {
    payload = (await req.json()) as EmailWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (
    typeof payload.to !== 'string' ||
    typeof payload.subject !== 'string' ||
    typeof payload.text !== 'string' ||
    typeof payload.html !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid email payload' }, { status: 400 })
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    logError('email.resend.failed', undefined, { status: response.status, details })
    return NextResponse.json({ error: 'Email provider failed' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
