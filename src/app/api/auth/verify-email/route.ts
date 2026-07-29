import { NextResponse } from 'next/server'
import { verifyEmailToken } from '@/lib/email-verification'
import { getAppUrlOrRequestOrigin } from '@/lib/app-url'
import { syncVerifiedIdentity } from '@/lib/verified-identity-sync'
import { logWarn } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const appUrl = getAppUrlOrRequestOrigin(req)

  if (!token) {
    return NextResponse.redirect(`${appUrl}/login?verified=missing`)
  }

  const result = await verifyEmailToken(token)
  if (!result.ok) {
    return NextResponse.redirect(`${appUrl}/login?verified=invalid`)
  }

  try {
    await syncVerifiedIdentity(result.userId)
  } catch (error) {
    logWarn('auth.verify_email.identity_sync_deferred', {
      userId: result.userId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }

  return NextResponse.redirect(`${appUrl}/login?verified=1`)
}
