import { describe, expect, it } from 'vitest'
import {
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
})
