import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getRemnashopSyncDryRun, syncRemnashopCatalog } from '@/lib/remnashop-sync'
import { syncRemnashopUsersToCabinet } from '@/lib/remnashop-users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  await requireAdmin()

  const url = new URL(req.url)
  const apply = url.searchParams.get('apply') === '1' || url.searchParams.get('apply') === 'true'
  const includePromoCodes = url.searchParams.get('promoCodes') !== '0'

  try {
    const report = apply
      ? await (async () => {
          const [catalog, users] = await Promise.all([
            syncRemnashopCatalog({ includePromoCodes }),
            syncRemnashopUsersToCabinet(),
          ])
          return {
            ...catalog,
            counts: {
              ...catalog.counts,
              usersCreated: users.created,
              usersUpdated: users.updated,
              usersSkipped: users.skipped,
            },
          }
        })()
      : await getRemnashopSyncDryRun()
    return NextResponse.json(report)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'remnashop sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
