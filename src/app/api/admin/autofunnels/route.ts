import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getAutoFunnelSettings, previewAutoFunnel } from '@/lib/autofunnels'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  await requireAdmin()
  const url = new URL(req.url)
  const previewId = url.searchParams.get('preview')
  if (previewId) {
    const preview = await previewAutoFunnel(previewId)
    return NextResponse.json({ preview })
  }
  const funnels = await getAutoFunnelSettings()
  return NextResponse.json({ funnels })
})
