import { describe, expect, it } from 'vitest'
import {
  buildSupportAttachment,
  readSupportMutationRequest,
  SupportAttachmentError,
} from './support-attachments'

function multipartRequest(files: Blob[]) {
  const form = new FormData()
  form.set('category', 'payment')
  form.set('message', 'Оплата прошла, но доступа нет')
  files.forEach((file, index) => form.append('files', file, `screen-${index}.png`))
  return new Request('https://cabinet.example/api/support/tickets', {
    method: 'POST',
    body: form,
  })
}

function pngOfSize(size: number) {
  const bytes = new Uint8Array(size)
  if (size >= 8) bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return new Blob([bytes], { type: 'image/png' })
}

describe('support attachments', () => {
  it('accepts a real PNG and keeps the form fields', async () => {
    const png = new Blob(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      { type: 'image/png' }
    )

    const result = await readSupportMutationRequest(multipartRequest([png]))

    expect(result.body).toEqual({
      category: 'payment',
      message: 'Оплата прошла, но доступа нет',
      clientMessageId: undefined,
    })
    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0]).toMatchObject({
      fileName: 'screen-0.png',
      mimeType: 'image/png',
      sizeBytes: 8,
    })
  })

  it('rejects a spoofed content type', async () => {
    const fakePng = new Blob([new TextEncoder().encode('not an image')], { type: 'image/png' })

    await expect(readSupportMutationRequest(multipartRequest([fakePng])))
      .rejects.toBeInstanceOf(SupportAttachmentError)
  })

  it('limits one message to three files', async () => {
    const png = () => new Blob(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      { type: 'image/png' }
    )

    await expect(readSupportMutationRequest(multipartRequest([png(), png(), png(), png()])))
      .rejects.toThrow('не больше 3 файлов')
  })

  it('accepts three files exactly at the 5 MB boundary', async () => {
    const result = await readSupportMutationRequest(multipartRequest([
      pngOfSize(5 * 1024 * 1024),
      pngOfSize(5 * 1024 * 1024),
      pngOfSize(5 * 1024 * 1024),
    ]))

    expect(result.attachments).toHaveLength(3)
    expect(result.attachments.every((file) => file.sizeBytes === 5 * 1024 * 1024)).toBe(true)
  })

  it('rejects an empty file and a file above 5 MB', async () => {
    await expect(readSupportMutationRequest(multipartRequest([pngOfSize(0)])))
      .rejects.toThrow('не больше 5 МБ')
    await expect(readSupportMutationRequest(multipartRequest([pngOfSize(5 * 1024 * 1024 + 1)])))
      .rejects.toThrow('не больше 5 МБ')
  })

  // Программный путь: файл, скачанный ботом из Telegram, проходит те же проверки.
  it('validates bot-downloaded files with the same rules', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
    const ok = buildSupportAttachment({ fileName: 'photo.jpg', mimeType: 'image/jpeg', data: jpeg })
    expect(ok).toMatchObject({ fileName: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 8 })

    expect(() => buildSupportAttachment({ fileName: 'notes.txt', mimeType: 'text/plain', data: Buffer.from('hi') }))
      .toThrow('JPG, PNG, WEBP и PDF')
    expect(() => buildSupportAttachment({ fileName: 'fake.png', mimeType: 'image/png', data: Buffer.from('not an image') }))
      .toThrow('не совпадает')
    expect(() => buildSupportAttachment({ fileName: 'big.png', mimeType: 'image/png', data: Buffer.alloc(5 * 1024 * 1024 + 1) }))
      .toThrow('не больше 5 МБ')
  })
})
