export const CHAT_SEARCH_HIGHLIGHT_START = '\uE000'
export const CHAT_SEARCH_HIGHLIGHT_END = '\uE001'

export type ChatSearchHighlightPart = {
  text: string
  highlighted: boolean
}

export function stripChatSearchHighlights(value: string): string {
  return value
    .replaceAll(CHAT_SEARCH_HIGHLIGHT_START, '')
    .replaceAll(CHAT_SEARCH_HIGHLIGHT_END, '')
}

export function parseChatSearchHighlights(value: string): ChatSearchHighlightPart[] {
  const parts: ChatSearchHighlightPart[] = []
  let cursor = 0

  while (cursor < value.length) {
    const start = value.indexOf(CHAT_SEARCH_HIGHLIGHT_START, cursor)
    if (start < 0) {
      parts.push({
        text: value.slice(cursor),
        highlighted: false
      })
      break
    }

    const end = value.indexOf(
      CHAT_SEARCH_HIGHLIGHT_END,
      start + CHAT_SEARCH_HIGHLIGHT_START.length
    )
    if (end < 0) {
      parts.push({
        text: value.slice(cursor),
        highlighted: false
      })
      break
    }

    if (start > cursor) {
      parts.push({
        text: value.slice(cursor, start),
        highlighted: false
      })
    }

    parts.push({
      text: value.slice(start + CHAT_SEARCH_HIGHLIGHT_START.length, end),
      highlighted: true
    })
    cursor = end + CHAT_SEARCH_HIGHLIGHT_END.length
  }

  return parts
}
