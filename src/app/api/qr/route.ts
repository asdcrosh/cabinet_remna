// GET /api/qr?text=...
// Возвращает PNG QR-код. Используется клиентом, чтобы не тянуть
// тяжёлую либу в браузер.
import { jsonResponse } from '@/lib/json-response'
import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { getSession } from '@/lib/auth/cookies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_QR_TEXT_LENGTH = 4096

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const text = url.searchParams.get('text')
  if (!text) {
    return jsonResponse({ error: 'text is required' }, { status: 400 })
  }
  if (text.length > MAX_QR_TEXT_LENGTH) {
    return jsonResponse({ error: 'text is too long' }, { status: 413 })
  }
  try {
    const png = await QRCode.toBuffer(text, {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 1,
      width: 256,
    })
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    return jsonResponse({ error: 'qr generation failed' }, { status: 500 })
  }
}
