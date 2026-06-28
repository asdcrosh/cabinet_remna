import { describe, expect, it } from 'vitest'
import { escapeTelegramHtml, renderTelegramCustomEmoji, stripTelegramCustomEmojiMarkup } from './telegram-format'

describe('telegram formatting', () => {
  it('escapes HTML while preserving regular emoji', () => {
    expect(escapeTelegramHtml('Скидка <20%> 🔥')).toBe('Скидка &lt;20%&gt; 🔥')
  })

  it('renders Telegram custom emoji helper markup', () => {
    expect(renderTelegramCustomEmoji('Бонус {tg:5368324170671202286:🔥} сегодня')).toBe(
      'Бонус <tg-emoji emoji-id="5368324170671202286">🔥</tg-emoji> сегодня'
    )
  })

  it('strips custom emoji markup for in-app and email text', () => {
    expect(stripTelegramCustomEmojiMarkup('Бонус {tg:5368324170671202286:🔥} сегодня')).toBe('Бонус 🔥 сегодня')
  })
})

