import { describe, expect, it } from 'vitest'
import {
  CHAT_SEARCH_HIGHLIGHT_END,
  CHAT_SEARCH_HIGHLIGHT_START,
  parseChatSearchHighlights,
  stripChatSearchHighlights
} from '../chatSearchHighlights'

describe('parseChatSearchHighlights', () => {
  it('parses multiple highlighted ranges and removes protocol markers', () => {
    const value = [
      'SQLite ',
      CHAT_SEARCH_HIGHLIGHT_START,
      '全文搜索',
      CHAT_SEARCH_HIGHLIGHT_END,
      ' with ',
      CHAT_SEARCH_HIGHLIGHT_START,
      'FTS5',
      CHAT_SEARCH_HIGHLIGHT_END
    ].join('')

    expect(parseChatSearchHighlights(value)).toEqual([
      { text: 'SQLite ', highlighted: false },
      { text: '全文搜索', highlighted: true },
      { text: ' with ', highlighted: false },
      { text: 'FTS5', highlighted: true }
    ])
  })

  it('preserves plain snippets', () => {
    expect(parseChatSearchHighlights('plain snippet')).toEqual([
      { text: 'plain snippet', highlighted: false }
    ])
  })

  it('preserves an unmatched start marker as plain text', () => {
    const value = `plain ${CHAT_SEARCH_HIGHLIGHT_START}snippet`

    expect(parseChatSearchHighlights(value)).toEqual([
      { text: value, highlighted: false }
    ])
  })
})

describe('stripChatSearchHighlights', () => {
  it('removes balanced and stray private-use markers while preserving text', () => {
    const value = [
      'before ',
      CHAT_SEARCH_HIGHLIGHT_START,
      'match',
      CHAT_SEARCH_HIGHLIGHT_END,
      ' after ',
      CHAT_SEARCH_HIGHLIGHT_START
    ].join('')

    expect(stripChatSearchHighlights(value)).toBe('before match after ')
  })
})
