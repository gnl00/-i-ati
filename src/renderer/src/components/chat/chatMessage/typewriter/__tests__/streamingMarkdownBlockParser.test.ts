import { describe, expect, it } from 'vitest'
import {
  buildMarkdownBlockParseSnapshot,
  parseMarkdownBlocks
} from '../streamingMarkdownBlockParser'

describe('streamingMarkdownBlockParser', () => {
  it('matches the full parse result for paragraph append updates', () => {
    const previous = buildMarkdownBlockParseSnapshot('第一段')
    const nextText = '第一段继续\n\n第二段'

    const snapshot = buildMarkdownBlockParseSnapshot(nextText, previous)

    expect(snapshot.blocks).toEqual(parseMarkdownBlocks(nextText))
  })

  it('matches the full parse result for list append updates', () => {
    const previous = buildMarkdownBlockParseSnapshot('- one')
    const nextText = '- one\n- two\n- three'

    const snapshot = buildMarkdownBlockParseSnapshot(nextText, previous)

    expect(snapshot.blocks).toEqual(parseMarkdownBlocks(nextText))
  })

  it('matches the full parse result for quote append updates', () => {
    const previous = buildMarkdownBlockParseSnapshot('> one')
    const nextText = '> one\n> two'

    const snapshot = buildMarkdownBlockParseSnapshot(nextText, previous)

    expect(snapshot.blocks).toEqual(parseMarkdownBlocks(nextText))
  })

  it('matches the full parse result for fenced code append updates', () => {
    const previous = buildMarkdownBlockParseSnapshot('```ts\nconst a = 1')
    const nextText = '```ts\nconst a = 1\nconst b = 2\n```'

    const snapshot = buildMarkdownBlockParseSnapshot(nextText, previous)

    expect(snapshot.blocks).toEqual(parseMarkdownBlocks(nextText))
  })

  it('starts a new suffix parse after a blank-line boundary', () => {
    const previous = buildMarkdownBlockParseSnapshot('第一段\n\n')
    const nextText = '第一段\n\n第二段'

    const snapshot = buildMarkdownBlockParseSnapshot(nextText, previous)

    expect(snapshot.blocks).toEqual(parseMarkdownBlocks(nextText))
    expect(snapshot.blocks[0]?.startOffset).toBe(0)
    expect(snapshot.blocks[1]?.startOffset).toBe(previous.text.length)
  })

  it('falls back to full parse when the new text is not an append', () => {
    const previous = buildMarkdownBlockParseSnapshot('hello world')
    const nextText = 'hello'

    const snapshot = buildMarkdownBlockParseSnapshot(nextText, previous)

    expect(snapshot.blocks).toEqual(parseMarkdownBlocks(nextText))
  })
})
