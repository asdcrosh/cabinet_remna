import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getAppUrl } from '@/lib/app-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

export const POST = withAuth(async (req: Request) => {
  await requireAdmin()

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 400 })
  }

  const extension = ALLOWED_TYPES.get(file.type)
  if (!extension) {
    return NextResponse.json({ error: 'Поддерживаются JPG, PNG, WEBP и GIF' }, { status: 400 })
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: 'Картинка должна быть до 5 МБ' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const directory = path.join(process.cwd(), 'public', 'uploads', 'broadcasts')
  const filename = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}.${extension}`
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, filename), bytes, { flag: 'wx' })

  return NextResponse.json({
    url: `${getAppUrl()}/uploads/broadcasts/${filename}`,
  })
})
