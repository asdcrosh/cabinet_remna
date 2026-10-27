import { jsonResponse } from '@/lib/json-response'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getSystemHealth } from '@/lib/system-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  await requireAdmin()
  return jsonResponse(await getSystemHealth())
})

export const POST = withAuth(async () => {
  await requireAdmin()
  return jsonResponse(await getSystemHealth({ sendEmail: true }))
})
