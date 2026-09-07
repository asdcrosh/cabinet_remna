import { NextResponse } from 'next/server'
import { requireAuth, requireStaff, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAuth()
  const { id } = await params
  const attachment = await prisma.supportAttachment.findUnique({
    where: { id },
    select: {
      fileName: true,
      mimeType: true,
      data: true,
      message: { select: { ticket: { select: { userId: true } } } },
    },
  })

  if (!attachment) {
    return NextResponse.json({ error: 'Файл не найден.' }, { status: 404 })
  }
  if (attachment.message.ticket.userId !== session.uid) {
    await requireStaff()
  }

  const safeAsciiName = attachment.fileName.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'attachment'
  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
