import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

export const POST = withAuth(async (req: Request) => {
  await requireAdmin()
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!isUploadedFile(file)) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 400 })
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: 'Логотип должен быть до 5 МБ' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const detected = detectImageType(bytes)
  if (!detected || (file.type && file.type !== detected.mimeType)) {
    return NextResponse.json({ error: 'Поддерживаются JPG, PNG и WEBP' }, { status: 415 })
  }

  const directory = path.join(process.cwd(), 'public', 'uploads', 'branding')
  const filename = `${randomUUID()}.${detected.extension}`
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, filename), bytes, { flag: 'wx' })
  return NextResponse.json({ logoUrl: `/uploads/branding/${filename}` })
})

function isUploadedFile(value: FormDataEntryValue | null | undefined): value is File {
  return Boolean(value && typeof value === 'object' && typeof (value as Blob).arrayBuffer === 'function')
}

function detectImageType(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' }
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: 'image/png', extension: 'png' }
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp' }
  }
  return null
}
