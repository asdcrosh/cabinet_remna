export const SUPPORT_ATTACHMENT_MAX_FILES = 3
export const SUPPORT_ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

export const supportAttachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} as const

export class SupportAttachmentError extends Error {}

export async function readSupportMutationRequest(req: Request) {
  if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
    return { body: await req.json(), attachments: [] }
  }

  const form = await req.formData()
  return {
    body: {
      category: form.get('category') ?? undefined,
      message: form.get('message'),
    },
    attachments: await readSupportAttachments(form.getAll('files')),
  }
}

export async function readSupportAttachments(entries: FormDataEntryValue[]) {
  const files = entries.filter(isUploadedFile)
  if (files.length > SUPPORT_ATTACHMENT_MAX_FILES) {
    throw new SupportAttachmentError(`Можно прикрепить не больше ${SUPPORT_ATTACHMENT_MAX_FILES} файлов.`)
  }

  return Promise.all(files.map(async (file) => {
    if (file.size <= 0 || file.size > SUPPORT_ATTACHMENT_MAX_SIZE) {
      throw new SupportAttachmentError('Размер каждого файла должен быть не больше 5 МБ.')
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new SupportAttachmentError('Поддерживаются JPG, PNG, WEBP и PDF.')
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    if (!matchesDeclaredType(bytes, file.type)) {
      throw new SupportAttachmentError('Тип прикреплённого файла не совпадает с его содержимым.')
    }

    return {
      fileName: sanitizeFileName(file.name),
      mimeType: file.type,
      sizeBytes: file.size,
      data: bytes,
    }
  }))
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return typeof value === 'object'
    && value !== null
    && typeof (value as Blob).arrayBuffer === 'function'
    && typeof (value as Blob).size === 'number'
}

function matchesDeclaredType(bytes: Buffer, mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (mimeType === 'image/png') {
    return bytes.length >= 8
      && bytes[0] === 0x89
      && bytes.subarray(1, 4).toString('ascii') === 'PNG'
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  if (mimeType === 'application/pdf') {
    return bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  }
  return false
}

function sanitizeFileName(value: string) {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]+/g, '-')
    .trim()
    .slice(0, 120)
  return normalized || 'attachment'
}
