import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  role: z.enum(['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']),
})

export const PATCH = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAdmin()
  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.uid }, select: { id: true, role: true } }),
    prisma.user.findUnique({ where: { id: params.id }, select: { id: true, role: true } }),
  ])

  if (!actor || !target) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }
  if (actor.id === target.id) {
    return NextResponse.json({ error: 'Нельзя изменить собственную роль' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректная роль' }, { status: 400 })
  }

  if (actor.role !== 'SUPER_ADMIN') {
    if (['ADMIN', 'SUPER_ADMIN'].includes(target.role) || ['ADMIN', 'SUPER_ADMIN'].includes(parsed.data.role)) {
      return NextResponse.json({ error: 'Назначать администраторов может только главный администратор' }, { status: 403 })
    }
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data: { role: parsed.data.role },
    select: { id: true, role: true },
  })

  await writeAuditLog({
    actorId: session.uid,
    targetId: target.id,
    action: 'ADMIN_ROLE_CHANGED',
    message: 'Администратор изменил роль пользователя',
    metadata: { from: target.role, to: parsed.data.role },
    request: req,
  })

  return NextResponse.json({ user })
})
