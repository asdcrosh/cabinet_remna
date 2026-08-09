import type { PaymentEventStage, PaymentEventStatus, Prisma } from '@prisma/client'
import { logWarn } from './logger'
import { prisma } from './prisma'

interface RecordPaymentEventInput {
  paymentId: string
  stage: PaymentEventStage
  status?: PaymentEventStatus
  source: string
  message: string
  details?: Record<string, unknown>
  dedupeKey?: string
}

const SENSITIVE_KEY_PATTERN = /(password|token|secret|authorization|cookie|api[-_]?key)/i

export async function recordPaymentEvent(input: RecordPaymentEventInput) {
  const details = input.details ? sanitizeDetails(input.details) : undefined
  const data = {
    paymentId: input.paymentId,
    stage: input.stage,
    status: input.status ?? 'INFO' as const,
    source: input.source.slice(0, 120),
    message: input.message.slice(0, 1000),
    details,
  }

  try {
    if (input.dedupeKey) {
      const dedupeKey = `${input.paymentId}:${input.dedupeKey}`.slice(0, 300)
      return await prisma.paymentEvent.upsert({
        where: { dedupeKey },
        create: { ...data, dedupeKey },
        update: {
          stage: data.stage,
          status: data.status,
          source: data.source,
          message: data.message,
          details: data.details,
          attempts: { increment: 1 },
        },
      })
    }

    return await prisma.paymentEvent.create({ data })
  } catch (error) {
    try {
      logWarn('payment.event_write_failed', {
        paymentId: input.paymentId,
        stage: input.stage,
        source: input.source,
        message: error instanceof Error ? error.message : String(error),
      })
    } catch {
      // Диагностический журнал не должен ломать основной платёжный сценарий.
    }
    return null
  }
}

export function paymentErrorDetails(error: unknown, extra?: Record<string, unknown>) {
  return {
    ...extra,
    error: error instanceof Error ? error.message : String(error),
  }
}

function sanitizeDetails(value: Record<string, unknown>) {
  return sanitizeValue(value, 0) as Prisma.InputJsonValue
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 5) return '[truncated]'
  if (value == null) return null
  if (typeof value === 'string') return value.slice(0, 2000)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return value.message.slice(0, 2000)
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1))
  if (typeof value !== 'object') return String(value).slice(0, 2000)

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitizeValue(entry, depth + 1),
      ])
  )
}
