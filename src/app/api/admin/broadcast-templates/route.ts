import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { getAppUrl } from '@/lib/app-url'
import { writeAuditLog } from '@/lib/audit-log'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ACTION_HREF_LENGTH = 600

const schema = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(140).optional().nullable(),
  body: z.string().trim().min(5).max(1200),
  segment: z.enum(['ALL', 'ACTIVE', 'NO_ACTIVE', 'EXPIRED', 'NEVER_PURCHASED', 'INACTIVE_N_DAYS', 'INACTIVE_45D']),
  inactiveDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
  channels: z.array(z.enum(['IN_APP', 'EMAIL', 'TELEGRAM'])).min(1).max(3),
  actionHref: z.string().trim().max(MAX_ACTION_HREF_LENGTH).optional().nullable(),
  actionLabel: z.string().trim().max(32).optional().nullable(),
  actionOpenInTelegram: z.boolean().optional(),
  imageUrl: z.string().trim().url().max(600).optional().nullable().or(z.literal('')),
})

export const GET = withAuth(async () => {
  if (!isFeatureEnabled('broadcasts')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await requireAdmin()
  const templates = await prisma.broadcastTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({
    templates: templates.map((template) => ({
      ...template,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    })),
  })
})

export const POST = withAuth(async (req: Request) => {
  if (!isFeatureEnabled('broadcasts')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const session = await requireAdmin()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Проверьте название, текст, сегмент и каналы шаблона' }, { status: 400 })
  }

  const input = parsed.data
  const template = await prisma.broadcastTemplate.create({
    data: {
      title: input.title,
      description: input.description || null,
      body: input.body,
      segment: input.segment === 'INACTIVE_45D' ? 'INACTIVE_N_DAYS' : input.segment,
      inactiveDays: input.segment === 'INACTIVE_45D' || input.segment === 'INACTIVE_N_DAYS' ? input.inactiveDays ?? 45 : null,
      channels: input.channels,
      actionHref: normalizeActionHref(input.actionHref),
      actionLabel: input.actionLabel || null,
      actionOpenInTelegram: Boolean(input.actionOpenInTelegram && normalizeActionHref(input.actionHref)),
      imageUrl: input.imageUrl || null,
      createdById: session.uid,
    },
  })
  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_BROADCAST_TEMPLATE_CREATED',
    message: 'Администратор создал шаблон рассылки',
    metadata: {
      entityType: 'broadcastTemplate',
      templateId: template.id,
      title: template.title,
      segment: template.segment,
      channels: template.channels,
    },
    request: req,
  })

  return NextResponse.json({
    template: {
      ...template,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    },
  })
})

function normalizeActionHref(value: string | null | undefined) {
  let href = value?.trim()
  if (!href) return null
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      const url = new URL(href)
      if (url.origin !== getAppUrl()) return null
      href = `${url.pathname}${url.search}${url.hash}`
    } catch {
      return null
    }
  }
  if (!href.startsWith('/dashboard')) return null
  return href
}
