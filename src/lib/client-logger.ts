'use client'

import * as Sentry from '@sentry/nextjs'

export function reportClientError(event: string, error: unknown) {
  const normalizedError = error instanceof Error ? error : new Error(String(error))

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[${event}]`, normalizedError)
  }

  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  Sentry.withScope((scope) => {
    scope.setTag('event', event)
    Sentry.captureException(normalizedError)
  })
}
