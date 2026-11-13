import { beforeEach, describe, expect, it, vi } from 'vitest'

const botCall = vi.hoisted(() => vi.fn())
vi.mock('./bot-api', () => ({ miniAppBotCall: botCall }))

import { displayCallbackScreen } from './callback-screen'

describe('Telegram rich screen navigation', () => {
  beforeEach(() => { botCall.mockReset().mockResolvedValue({}) })

  it('edits a card that Telegram permits editing', async () => {
    await displayCallbackScreen(123, 456, '<h3>Тарифы</h3>', 'https://cabinet.example.test/miniapp')
    expect(botCall).toHaveBeenCalledTimes(1)
    expect(botCall).toHaveBeenCalledWith('editMessageText', expect.objectContaining({ chat_id: 123, message_id: 456 }))
  })

  it('sends the next card when Telegram rejects editing a keyboard-removal message', async () => {
    botCall.mockRejectedValueOnce(new Error('Telegram editMessageText failed'))
    await displayCallbackScreen(123, 456, '<h3>Устройства</h3>', 'https://cabinet.example.test/miniapp')
    expect(botCall).toHaveBeenNthCalledWith(2, 'sendRichMessage', { chat_id: 123,
      rich_message: { html: '<h3>Устройства</h3>' }, protect_content: true })
  })

  it('keeps the callback retryable if both edit and send fail', async () => {
    botCall.mockRejectedValueOnce(new Error('Telegram editMessageText failed'))
      .mockRejectedValueOnce(new Error('Telegram sendRichMessage failed'))
    await expect(displayCallbackScreen(123, 456, '<h3>Поддержка</h3>', 'https://cabinet.example.test/miniapp')).rejects.toThrow('Telegram sendRichMessage failed')
  })
})
