import { beforeEach, describe, expect, it, vi } from 'vitest'

const botCall = vi.hoisted(() => vi.fn())
vi.mock('./bot-api', () => ({ miniAppBotCall: botCall }))

import { displayCallbackScreen } from './callback-screen'

describe('Telegram rich screen navigation', () => {
  beforeEach(() => { botCall.mockReset().mockResolvedValue({}) })

  it('edits a card that Telegram permits editing', async () => {
    const used = await displayCallbackScreen(123, 456, '<h3>Тарифы</h3>', 'https://cabinet.example.test/miniapp')
    expect(used).toBe(456)
    expect(botCall).toHaveBeenCalledTimes(1)
    expect(botCall).toHaveBeenCalledWith('editMessageText', expect.objectContaining({ chat_id: 123, message_id: 456 }))
  })

  it('treats a “message is not modified” refusal as a successful no-op', async () => {
    botCall.mockRejectedValueOnce(new Error('Telegram editMessageText failed: Bad Request: message is not modified'))
    const used = await displayCallbackScreen(123, 456, '<h3>Тарифы</h3>')
    expect(used).toBe(456)
    expect(botCall).toHaveBeenCalledTimes(1)
  })

  it('sends the next card when Telegram rejects editing a keyboard-removal message', async () => {
    botCall.mockRejectedValueOnce(new Error('Telegram editMessageText failed'))
      .mockResolvedValueOnce({ message_id: 789 })
    const used = await displayCallbackScreen(123, 456, '<h3>Устройства</h3>', 'https://cabinet.example.test/miniapp')
    expect(used).toBe(789)
    expect(botCall).toHaveBeenNthCalledWith(2, 'sendRichMessage', { chat_id: 123,
      rich_message: { html: '<h3>Устройства</h3>' }, protect_content: true })
  })

  it('keeps the callback retryable if both edit and send fail', async () => {
    botCall.mockRejectedValueOnce(new Error('Telegram editMessageText failed'))
      .mockRejectedValueOnce(new Error('Telegram sendRichMessage failed'))
    await expect(displayCallbackScreen(123, 456, '<h3>Поддержка</h3>', 'https://cabinet.example.test/miniapp')).rejects.toThrow('Telegram sendRichMessage failed')
  })
})
