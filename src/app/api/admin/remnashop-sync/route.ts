import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getRemnashopSyncDryRun, syncRemnashopCatalog } from '@/lib/remnashop-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  await requireAdmin()

  const url = new URL(req.url)
  const apply = url.searchParams.get('apply') === '1' || url.searchParams.get('apply') === 'true'
  const planScope = url.searchParams.get('scope') === 'active' ? 'active' : 'all'
  const includePromoCodes = url.searchParams.get('promoCodes') !== '0'

  try {
    const report = apply
      ? await syncRemnashopCatalog({ planScope, includePromoCodes })
      : await getRemnashopSyncDryRun()
    return NextResponse.json(report)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'remnashop sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
