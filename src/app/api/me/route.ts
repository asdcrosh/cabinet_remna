// GET /api/me — отдаёт текущего юзера (для клиентских хуков / UI).
// Не падаем с 401, а возвращаем user: null — клиенту удобнее.

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { updateProfileSchema } from '@/lib/auth/validation'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getCurrentUser()
  if (!session) {
    return NextResponse.json({ user: null })
  }
  // Подтянем свежие данные (имя, согласия) из БД
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })
  if (!user) {
    return NextResponse.json({ user: null })
  }
  return NextResponse.json({ user })
}

export const PATCH = withAuth(async (req: Request) => {
  const session = await requireAuth()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const user = await prisma.user.update({
    where: { id: session.uid },
    data: { name: parsed.data.name?.trim() || null },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })

  return NextResponse.json({ user })
})
