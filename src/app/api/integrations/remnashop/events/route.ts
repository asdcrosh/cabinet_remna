import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { syncRemnashopCatalog, syncRemnashopPaymentsToCabinet } from '@/lib/remnashop-sync'
import { syncRemnashopUserBySourceId } from '@/lib/remnashop-users'
import { markSyncFailed, markSyncSucceeded } from '@/lib/sync-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 1024 * 1024

type RemnashopEventBody = {
  event?: unknown
  type?: unknown
  id?: unknown
  userId?: unknown
  user_id?: unknown
  paymentId?: unknown
  payment_id?: unknown
  data?: Record<string, unknown>
}

export async function POST(req: Request) {
  const secret = process.env.REMNASHOP_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'Remnashop webhook is not configured' }, { status: 503 })
  }

  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload is too large' }, { status: 413 })
  }

  const rawBody = await req.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload is too large' }, { status: 413 })
  }
  if (!isAuthorized(req, rawBody, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: RemnashopEventBody
  try {
    body = JSON.parse(rawBody) as RemnashopEventBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventName = readText(body.event) || readText(body.type)
  if (!eventName) return NextResponse.json({ error: 'event is required' }, { status: 400 })

  try {
    const result = await handleEvent(eventName.toLowerCase(), body)
    return NextResponse.json({ ok: true, event: eventName, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Remnashop event failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function handleEvent(eventName: string, body: RemnashopEventBody) {
  if (eventName.startsWith('user.') || eventName.startsWith('users.')) {
    const sourceId = readPositiveInt(
      body.userId ?? body.user_id ?? body.data?.userId ?? body.data?.user_id ?? body.data?.id ?? body.id
    )
    if (!sourceId) throw new Error('user id is required')
    if (eventName.endsWith('.deleted')) return { ignored: 'local account is retained' }

    const result = await syncRemnashopUserBySourceId(sourceId, {
      forceRemnawaveSubscriptions: true,
    })
    if (!result.found) throw new Error(result.reason)
    return result
  }

  if (
    eventName.startsWith('payment.') ||
    eventName.startsWith('payments.') ||
    eventName.startsWith('transaction.')
  ) {
    const paymentId = readText(
      body.paymentId ??
      body.payment_id ??
      body.data?.paymentId ??
      body.data?.payment_id ??
      body.data?.id ??
      body.id
    )
    if (!paymentId) throw new Error('payment id is required')

    let result = await syncRemnashopPaymentsToCabinet({ paymentId })
    if (result.blocked > 0) {
      const data = body.data
      const userId = readPositiveInt(data?.userId ?? data?.user_id)
      if (userId) {
        await syncRemnashopUserBySourceId(userId, { forceRemnawaveSubscriptions: true })
        result = await syncRemnashopPaymentsToCabinet({ paymentId })
      }
    }
    if (result.total === 0) throw new Error('remnashop payment not found')
    if (result.failed > 0) throw new Error('remnashop payment sync failed')
    return result
  }

  if (
    eventName.startsWith('plan.') ||
    eventName.startsWith('plans.') ||
    eventName.startsWith('promo.') ||
    eventName.startsWith('promocode.') ||
    eventName.startsWith('catalog.')
  ) {
    const syncEvent = {
      direction: 'REMNASHOP_TO_CABINET' as const,
      entityType: 'catalog',
      entityId: 'remnashop',
      operation: 'upsert',
    }
    try {
      const result = await syncRemnashopCatalog()
      await markSyncSucceeded(syncEvent)
      return result
    } catch (error) {
      await markSyncFailed(syncEvent, error)
      throw error
    }
  }

  throw new Error(`Unsupported Remnashop event: ${eventName}`)
}

function isAuthorized(req: Request, rawBody: string, secret: string) {
  const bearer = req.headers.get('authorization')
  if (bearer?.startsWith('Bearer ') && safeEqual(bearer.slice(7).trim(), secret)) return true

  const suppliedSignature = req.headers
    .get('x-remnashop-signature')
    ?.trim()
    .replace(/^sha256=/i, '')
  if (!suppliedSignature || !/^[a-f0-9]{64}$/i.test(suppliedSignature)) return false

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeEqual(suppliedSignature.toLowerCase(), expected)
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function readText(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function readPositiveInt(value: unknown) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
