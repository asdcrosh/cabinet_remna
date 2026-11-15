import { beforeEach, describe, expect, it, vi } from 'vitest'

const botCall = vi.hoisted(() => vi.fn())
vi.mock('./bot-api', () => ({ miniAppBotCall: botCall }))

const prismaMock = vi.hoisted(() => ({ findFirst: vi.fn(), updateMany: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: prismaMock } }))

import { displayCallbackScreen, showBotScreen } from './callback-screen'

describe('Telegram rich screen navigation', () => {
  beforeEach(() => {
    botCall.mockReset().mockResolvedValue({})
    prismaMock.findFirst.mockReset().mockResolvedValue(null)
    prismaMock.updateMany.mockReset().mockResolvedValue({ count: 1 })
  })

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

describe('Telegram single bot window (showBotScreen)', () => {
  beforeEach(() => {
    botCall.mockReset().mockResolvedValue({})
    prismaMock.findFirst.mockReset().mockResolvedValue(null)
    prismaMock.updateMany.mockReset().mockResolvedValue({ count: 1 })
  })

  it('edits the remembered window instead of sending a new message', async () => {
    prismaMock.findFirst.mockResolvedValue({ botScreenMessageId: 456 })
    const used = await showBotScreen(123, '<h3>Тарифы</h3>')
    expect(used).toBe(456)
    expect(botCall).toHaveBeenCalledTimes(1)
    expect(botCall).toHaveBeenCalledWith('editMessageText', expect.objectContaining({ chat_id: 123, message_id: 456 }))
  })

  it('sends a clean anchor: keyboard removal goes via a deleted carrier message', async () => {
    botCall.mockResolvedValueOnce({ message_id: 900 }) // carrier sendMessage
      .mockResolvedValueOnce({}) // deleteMessage
      .mockResolvedValueOnce({ message_id: 901 }) // screen sendRichMessage
    const used = await showBotScreen(123, '<h3>Тарифы</h3>')
    expect(used).toBe(901)
    expect(botCall).toHaveBeenNthCalledWith(1, 'sendMessage', expect.objectContaining({
      chat_id: 123, reply_markup: { remove_keyboard: true } }))
    expect(botCall).toHaveBeenNthCalledWith(2, 'deleteMessage', { chat_id: 123, message_id: 900 })
    // Экран уходит без reply_markup: сообщение с ReplyKeyboardRemove Telegram не даёт править.
    expect(botCall).toHaveBeenNthCalledWith(3, 'sendRichMessage', { chat_id: 123,
      rich_message: { html: '<h3>Тарифы</h3>' }, protect_content: true })
    expect(prismaMock.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { botScreenMessageId: 901 } }))
  })

  it('resends the window fresh when an explicit command changes nothing on screen', async () => {
    prismaMock.findFirst.mockResolvedValue({ botScreenMessageId: 456 })
    botCall.mockRejectedValueOnce(new Error('Telegram editMessageText failed: Bad Request: message is not modified'))
      .mockResolvedValueOnce({}) // deleteMessage старого окна
      .mockResolvedValueOnce({ message_id: 903 }) // свежий экран внизу чата
    const used = await showBotScreen(123, '<h3>Главная</h3>', 457)
    expect(used).toBe(903)
    expect(botCall).toHaveBeenNthCalledWith(2, 'deleteMessage', { chat_id: 123, message_id: 456 })
    expect(botCall).toHaveBeenNthCalledWith(3, 'sendRichMessage', { chat_id: 123,
      rich_message: { html: '<h3>Главная</h3>' }, protect_content: true })
    expect(prismaMock.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { botScreenMessageId: 903 } }))
  })

  it('falls back to a fresh clean message when the remembered window is gone', async () => {
    prismaMock.findFirst.mockResolvedValue({ botScreenMessageId: 456 })
    botCall.mockRejectedValueOnce(new Error('Telegram editMessageText failed')) // правка якоря
      .mockResolvedValueOnce({ message_id: 902 }) // fallback в displayCallbackScreen — без reply_markup
    const used = await showBotScreen(123, '<h3>Тарифы</h3>')
    expect(used).toBe(902)
    expect(botCall).toHaveBeenNthCalledWith(2, 'sendRichMessage', { chat_id: 123,
      rich_message: { html: '<h3>Тарифы</h3>' }, protect_content: true })
    expect(prismaMock.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { botScreenMessageId: 902 } }))
  })
})
