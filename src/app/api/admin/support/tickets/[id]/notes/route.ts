import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStaff, withAuth } from '@/lib/auth/guard'
import { createSupportInternalNoteSchema, serializeSupportInternalNote } from '@/lib/support'
import { writeAuditLog } from '@/lib/audit-log'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  if (!await isFeatureEnabled('support')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const session = await requireStaff()
  const { id } = await params

  const parsed = createSupportInternalNoteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Напишите заметку перед сохранением.' }, { status: 400 })
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    select: { id: true, userId: true },
  })
  if (!ticket) {
    return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 })
  }

  const note = await prisma.supportInternalNote.create({
    data: {
      ticketId: ticket.id,
      authorId: session.uid,
      body: parsed.data.body,
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, email: true, name: true } },
    },
  })

  await writeAuditLog({
    actorId: session.uid,
    targetId: ticket.userId,
    action: 'ADMIN_SUPPORT_UPDATED',
    message: 'Добавлена внутренняя заметка к обращению',
    metadata: { ticketId: ticket.id, noteId: note.id },
    request: req,
  })

  return NextResponse.json({ note: serializeSupportInternalNote(note) }, { status: 201 })
})
