import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(140).optional().nullable(),
  body: z.string().trim().min(5).max(1200),
  segment: z.enum(['ALL', 'ACTIVE', 'NO_ACTIVE', 'EXPIRED', 'EMAIL_VERIFIED', 'TELEGRAM_LINKED', 'INACTIVE_45D']),
  channels: z.array(z.enum(['IN_APP', 'EMAIL', 'TELEGRAM'])).min(1).max(3),
  actionHref: z.string().trim().max(180).optional().nullable(),
  actionLabel: z.string().trim().max(32).optional().nullable(),
  imageUrl: z.string().trim().url().max(600).optional().nullable().or(z.literal('')),
})

export const GET = withAuth(async () => {
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
      segment: input.segment,
      channels: input.channels,
      actionHref: normalizeActionHref(input.actionHref),
      actionLabel: input.actionLabel || null,
      imageUrl: input.imageUrl || null,
      createdById: session.uid,
    },
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
  const href = value?.trim()
  if (!href) return null
  if (!href.startsWith('/dashboard')) return null
  return href
}
