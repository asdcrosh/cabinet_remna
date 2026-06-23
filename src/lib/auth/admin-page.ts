import { redirect } from 'next/navigation'
import { getSession } from './cookies'
import { prisma } from '@/lib/prisma'

export async function requireAdminPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/dashboard/admin')

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true, email: true, name: true, role: true },
  })

  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) redirect('/dashboard')

  return { session, user }
}

export async function requireStaffPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/dashboard/admin/support')

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true, email: true, name: true, role: true },
  })

  if (!user || !['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) redirect('/dashboard')
  return { session, user }
}

export async function requireSuperAdminPage() {
  const result = await requireAdminPage()
  if (result.user.role !== 'SUPER_ADMIN') redirect('/dashboard/admin')
  return result
}
