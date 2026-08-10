import { NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit-log'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getPublicBrandSettings, updateBrandSettings } from '@/lib/branding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/)
const logoUrl = z.string().trim().max(800).refine(
  (value) => value.startsWith('/uploads/branding/') || /^https:\/\//i.test(value),
  'Некорректный адрес логотипа'
).nullable()

const schema = z.object({
  logoUrl,
  accentColor: color,
  accentSecondaryColor: color,
}).strict()

export const GET = withAuth(async () => {
  await requireAdmin()
  return NextResponse.json({ branding: await getPublicBrandSettings() })
})

export const PATCH = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Проверьте логотип и цвета темы', details: parsed.error.flatten() }, { status: 422 })
  }

  const branding = await updateBrandSettings(parsed.data)
  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_FEATURES_UPDATED',
    message: 'Обновлено оформление кабинета',
    metadata: branding,
    request: req,
  })
  return NextResponse.json({ branding })
})
