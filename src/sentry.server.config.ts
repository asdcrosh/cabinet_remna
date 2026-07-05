import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampleRate: numberFromEnv('SENTRY_TRACES_SAMPLE_RATE', 0),
    sendDefaultPii: false,
  })
}

function numberFromEnv(key: string, fallback: number) {
  const value = process.env[key]
  if (!value) return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : fallback
}
