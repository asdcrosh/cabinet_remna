import { describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

class TestAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

vi.mock('@/lib/auth/guard', () => ({
  AuthError: TestAuthError,
  requireAdmin: vi.fn(async () => {
    throw new TestAuthError(403, 'Forbidden')
  }),
  requireStaff: vi.fn(async () => {
    throw new TestAuthError(403, 'Forbidden')
  }),
  requireSuperAdmin: vi.fn(async () => {
    throw new TestAuthError(403, 'Forbidden')
  }),
  withAuth: (handler: (...args: any[]) => Promise<NextResponse>) => async (...args: any[]) => {
    try {
      return await handler(...args)
    } catch (error) {
      if (error instanceof TestAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      throw error
    }
  },
}))

type AdminRouteCase = {
  name: string
  module: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  url?: string
  params?: Record<string, string>
}

const routeCases: AdminRouteCase[] = [
  { name: 'bonus prize update', module: './bonus-box/prizes/[id]/route', method: 'PATCH', params: { id: 'prize-1' } },
  { name: 'bonus prizes list', module: './bonus-box/prizes/route', method: 'GET' },
  { name: 'bonus prize create', module: './bonus-box/prizes/route', method: 'POST' },
  { name: 'bonus settings read', module: './bonus-box/settings/route', method: 'GET' },
  { name: 'bonus settings update', module: './bonus-box/settings/route', method: 'PATCH' },
  { name: 'broadcast template delete', module: './broadcast-templates/[id]/route', method: 'DELETE', params: { id: 'template-1' } },
  { name: 'broadcast templates list', module: './broadcast-templates/route', method: 'GET' },
  { name: 'broadcast template create', module: './broadcast-templates/route', method: 'POST' },
  { name: 'broadcast create', module: './broadcasts/route', method: 'POST' },
  { name: 'broadcast upload', module: './broadcasts/upload/route', method: 'POST' },
  { name: 'notification mark one', module: './notifications/[id]/route', method: 'PATCH', params: { id: 'notification-1' } },
  { name: 'notifications list', module: './notifications/route', method: 'GET' },
  { name: 'notifications mark all', module: './notifications/route', method: 'PATCH' },
  { name: 'notifications delete all', module: './notifications/route', method: 'DELETE' },
  { name: 'notifications summary', module: './notifications/summary/route', method: 'GET' },
  { name: 'offer update', module: './offers/[id]/route', method: 'PATCH', params: { id: 'offer-1' } },
  { name: 'payment sync', module: './payment-sync/route', method: 'POST' },
  { name: 'payments list', module: './payments/route', method: 'GET' },
  { name: 'plan update', module: './plans/[id]/route', method: 'PATCH', params: { id: 'plan-1' } },
  { name: 'plan delete', module: './plans/[id]/route', method: 'DELETE', params: { id: 'plan-1' } },
  { name: 'plans list', module: './plans/route', method: 'GET' },
  { name: 'plan create', module: './plans/route', method: 'POST' },
  { name: 'promo update', module: './promo-codes/[id]/route', method: 'PATCH', params: { id: 'promo-1' } },
  { name: 'promo delete', module: './promo-codes/[id]/route', method: 'DELETE', params: { id: 'promo-1' } },
  { name: 'promo list', module: './promo-codes/route', method: 'GET' },
  { name: 'promo bulk delete', module: './promo-codes/route', method: 'DELETE' },
  { name: 'promo bulk patch', module: './promo-codes/route', method: 'PATCH' },
  { name: 'promo create', module: './promo-codes/route', method: 'POST' },
  { name: 'recovery list', module: './recovery/route', method: 'GET' },
  { name: 'remnashop retry', module: './remnashop-sync/retry/route', method: 'POST' },
  { name: 'remnashop dry-run', module: './remnashop-sync/route', method: 'GET' },
  { name: 'remnashop sync', module: './remnashop-sync/route', method: 'POST' },
  { name: 'remnawave squads', module: './remnawave/squads/route', method: 'GET' },
  { name: 'stats', module: './stats/route', method: 'GET' },
  { name: 'support ticket read', module: './support/tickets/[id]/route', method: 'GET', params: { id: 'ticket-1' } },
  { name: 'support ticket reply', module: './support/tickets/[id]/route', method: 'POST', params: { id: 'ticket-1' } },
  { name: 'support ticket update', module: './support/tickets/[id]/route', method: 'PATCH', params: { id: 'ticket-1' } },
  { name: 'support tickets list', module: './support/tickets/route', method: 'GET' },
  { name: 'manual sync', module: './sync/route', method: 'POST' },
  { name: 'system health read', module: './system/health/route', method: 'GET' },
  { name: 'system health email', module: './system/health/route', method: 'POST' },
  { name: 'bonus attempts grant', module: './users/[id]/bonus-box-attempts/route', method: 'POST', params: { id: 'user-1' } },
  { name: 'user plan assign', module: './users/[id]/plan/route', method: 'POST', params: { id: 'user-1' } },
  { name: 'user profile update', module: './users/[id]/profile/route', method: 'PATCH', params: { id: 'user-1' } },
  { name: 'user role update', module: './users/[id]/role/route', method: 'PATCH', params: { id: 'user-1' } },
  { name: 'user sync', module: './users/[id]/sync/route', method: 'POST', params: { id: 'user-1' } },
  { name: 'users merge', module: './users/merge/route', method: 'POST' },
  { name: 'users list', module: './users/route', method: 'GET' },
  { name: 'welcome bonus update', module: './welcome-bonus/route', method: 'PATCH' },
]

describe('admin API authorization matrix', () => {
  it.each(routeCases)('returns 403 before admin handler work: $name', async (item) => {
    const route = await import(item.module)
    const handler = route[item.method] as ((req: Request, context?: { params: Record<string, string> }) => Promise<Response>) | undefined

    expect(handler).toBeTypeOf('function')
    const response = await handler!(
      new Request(item.url ?? 'http://localhost:3000/api/admin/test', {
        method: item.method,
        body: ['POST', 'PATCH', 'DELETE'].includes(item.method) ? JSON.stringify({}) : undefined,
      }),
      { params: item.params ?? {} }
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })
})
