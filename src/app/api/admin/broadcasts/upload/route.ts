import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getAppUrl } from '@/lib/app-url'
import { signBroadcastUploadUrl } from '@/lib/broadcast-upload-url'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_IMAGE_SIZE = 15 * 1024 * 1024
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

export const POST = withAuth(async (req: Request) => {
  if (!isFeatureEnabled('broadcasts')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await requireAdmin()

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!isUploadedFile(file)) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 400 })
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: 'Картинка должна быть до 15 МБ' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const detectedType = detectImageType(bytes)
  if (!detectedType || (file.type && file.type !== detectedType.mimeType)) {
    return NextResponse.json({ error: 'Поддерживаются JPG, PNG, WEBP и GIF' }, { status: 400 })
  }

  const directory = path.join(process.cwd(), 'public', 'uploads', 'broadcasts')
  const filename = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}.${detectedType.extension}`
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, filename), bytes, { flag: 'wx' })

  return NextResponse.json({
    url: signBroadcastUploadUrl(`${getAppUrl()}/uploads/broadcasts/${filename}`),
  })
})

function isUploadedFile(value: FormDataEntryValue | null | undefined): value is File {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === 'function' &&
    typeof (value as Blob).type === 'string' &&
    typeof (value as Blob).size === 'number'
  )
}

function detectImageType(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: ALLOWED_TYPES.get('image/jpeg')! }
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: ALLOWED_TYPES.get('image/png')! }
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: ALLOWED_TYPES.get('image/webp')! }
  }
  if (
    bytes.length >= 6 &&
    (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return { mimeType: 'image/gif', extension: ALLOWED_TYPES.get('image/gif')! }
  }
  return null
}
