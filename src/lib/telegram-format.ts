const CUSTOM_EMOJI_RE = /\{tg:([0-9]{5,32}):([^{}\n]{1,16})\}/g

export function escapeTelegramHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return char
    }
  })
}

export function renderTelegramCustomEmoji(value: string) {
  let output = ''
  let lastIndex = 0

  for (const match of value.matchAll(CUSTOM_EMOJI_RE)) {
    const index = match.index ?? 0
    const emojiId = match[1]
    const fallback = match[2] ?? ''
    if (!emojiId) continue

    output += escapeTelegramHtml(value.slice(lastIndex, index))
    output += `<tg-emoji emoji-id="${emojiId}">${escapeTelegramHtml(fallback)}</tg-emoji>`
    lastIndex = index + match[0].length
  }

  output += escapeTelegramHtml(value.slice(lastIndex))
  return output
}

export function stripTelegramCustomEmojiMarkup(value: string) {
  return value.replace(CUSTOM_EMOJI_RE, (_, _emojiId: string, fallback: string) => fallback)
}
