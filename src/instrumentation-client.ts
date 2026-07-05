import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  const replaysSessionSampleRate = numberFromEnv('NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE', 0)
  const replaysOnErrorSampleRate = numberFromEnv('NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE', 0)
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampleRate: numberFromEnv('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', 0),
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,
    sendDefaultPii: false,
    integrations: replayIntegrations(replaysSessionSampleRate, replaysOnErrorSampleRate),
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

function numberFromEnv(key: string, fallback: number) {
  const value = process.env[key]
  if (!value) return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : fallback
}

function replayIntegrations(sessionSampleRate: number, errorSampleRate: number) {
  if (sessionSampleRate <= 0 && errorSampleRate <= 0) return []
  return [Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })]
}
