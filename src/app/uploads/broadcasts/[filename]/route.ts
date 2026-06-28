import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

export async function GET(_: Request, { params }: { params: { filename: string } }) {
  const filename = params.filename
  if (!/^\d{4}-\d{2}-\d{2}-[a-f0-9-]+\.(jpg|png|webp|gif)$/i.test(filename)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  const contentType = CONTENT_TYPES[extension]
  if (!contentType) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const file = await readFile(path.join(process.cwd(), 'public', 'uploads', 'broadcasts', filename))
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
