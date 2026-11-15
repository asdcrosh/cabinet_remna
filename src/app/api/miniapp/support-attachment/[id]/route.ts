import { jsonResponse } from '@/lib/json-response'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { miniAppEnabled } from '@/lib/miniapp/config'
import { verifySupportAttachmentSignature } from '@/lib/miniapp/attachment-sign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Отдача вложения поддержки по подписанной ссылке из окна бота.
// Сессии у Telegram-клиента нет — доступ даёт HMAC-подпись id вложения.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!miniAppEnabled()) return jsonResponse({ error: 'Not found' }, { status: 404 })
  const { id } = await params
  const signature = new URL(req.url).searchParams.get('s')
  if (!verifySupportAttachmentSignature(id, signature)) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  }
  const attachment = await prisma.supportAttachment.findUnique({
    where: { id },
    select: { fileName: true, mimeType: true, data: true },
  })
  if (!attachment) return jsonResponse({ error: 'Файл не найден.' }, { status: 404 })

  const safeAsciiName = attachment.fileName.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'attachment'
  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      // Подпись не отзывается, но файл неизменен — короткий приватный кэш уместен.
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
