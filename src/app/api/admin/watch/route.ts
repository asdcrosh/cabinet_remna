import { NextResponse } from 'next/server'
import { requireSuperAdmin, withAuth } from '@/lib/auth/guard'
import { getWatchReport, runWatchCycle } from '@/lib/watch-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  await requireSuperAdmin()
  return NextResponse.json(await getWatchReport())
})

export const POST = withAuth(async () => {
  await requireSuperAdmin()
  await runWatchCycle('manual')
  return NextResponse.json(await getWatchReport())
})
