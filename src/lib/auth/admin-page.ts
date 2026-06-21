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

  if (!user || user.role !== 'ADMIN') redirect('/dashboard')

  return { session, user }
}
