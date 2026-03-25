import { describe, expect, it } from 'vitest'
import { formatTelegramRichText } from '../telegram-rich-text'

describe('formatTelegramRichText', () => {
  it('formats basic markdown into telegram-safe html', () => {
    const result = formatTelegramRichText('**Hello** _world_ `code`')

    expect(result.parseMode).toBe('HTML')
    expect(result.text).toContain('<b>Hello</b>')
    expect(result.text).toContain('<i>world</i>')
    expect(result.text).toContain('<pre><code>code</code></pre>')
    expect(result.fallbackText).toBe('Hello world code')
  })

  it('formats fenced code blocks and links', () => {
    const result = formatTelegramRichText('See [docs](https://example.com)\n\n```ts\nconst a = 1\n```')

    expect(result.parseMode).toBe('HTML')
    expect(result.text).toContain('<a href="https://example.com/">docs</a>')
    expect(result.text).toContain('<pre><code>const a = 1</code></pre>')
  })

  it('formats quotes and keeps markdown lists as plain text', () => {
    const result = formatTelegramRichText('> quoted line\n> second line\n\n- item one\n- item two')

    expect(result.parseMode).toBe('HTML')
    expect(result.text).toContain('<blockquote>quoted line\nsecond line</blockquote>')
    expect(result.text).toContain('- item one')
    expect(result.text).toContain('- item two')
  })

  it('keeps italic formatting stable around surrounding text', () => {
    const result = formatTelegramRichText('before _italic_ after')

    expect(result.parseMode).toBe('HTML')
    expect(result.text).toContain('before <i>italic</i> after')
  })

  it('supports strike and underline mappings for telegram html', () => {
    const result = formatTelegramRichText('~~strike~~ and __underline__')

    expect(result.parseMode).toBe('HTML')
    expect(result.text).toContain('<s>strike</s>')
    expect(result.text).toContain('<u>underline</u>')
  })

  it('falls back to plain text when there is no supported formatting', () => {
    const result = formatTelegramRichText('plain text only')

    expect(result.parseMode).toBeUndefined()
    expect(result.text).toBe('plain text only')
    expect(result.fallbackText).toBe('plain text only')
  })
})
