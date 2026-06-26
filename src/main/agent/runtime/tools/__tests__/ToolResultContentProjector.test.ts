import { describe, expect, it } from 'vitest'
import {
  formatToolResultForModel,
  projectToolResultContentForDisplay,
  projectToolResultContentForHistoryImport
} from '../ToolResultContentProjector'
import type { NormalizedToolResultContent } from '../result-normalization'
import { COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS } from '@shared/tools/toolResultContent'

describe('ToolResultContentProjector', () => {
  it('projects normalized content using its model payload for replay', () => {
    const content: NormalizedToolResultContent = {
      __atiToolResultNormalized: true,
      version: 1,
      toolName: 'read',
      toolCallId: 'call-1',
      status: 'success',
      summary: 'large result',
      original: {
        characters: 100_000,
        triggers: ['large_content']
      },
      artifacts: [],
      modelContent: '[normalized model content]'
    }

    expect(formatToolResultForModel({ content })).toBe('[normalized model content]')
  })

  it('keeps hot replay content uncompressed', () => {
    const content = `{"nodes":"${'x'.repeat(40_000)}","image":"data:image/png;base64,${'a'.repeat(200)}","tail":"hot-tail"}`

    expect(formatToolResultForModel({
      content,
      replayMode: 'hot'
    })).toBe(content)
  })

  it('compacts cold replay content for model requests', () => {
    const content = `{"image":"data:image/png;base64,${'a'.repeat(200)}"}`

    const projected = formatToolResultForModel({
      content,
      replayMode: 'cold'
    })

    expect(projected).toContain('[Tool result compacted for model request]')
    expect(projected).toContain('shownChars=0')
    expect(projected).toContain('reason=inline_image')
    expect(projected).not.toContain('data:image/png;base64')
  })

  it('includes a visible prefix when compacting cold large text content', () => {
    const shownPrefix = 'x'.repeat(COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS)
    const hiddenSuffix = 'hidden-tail'
    const content = `${shownPrefix}${hiddenSuffix}`

    const projected = formatToolResultForModel({
      content,
      replayMode: 'cold'
    })

    expect(projected).toContain('[Tool result compacted for model request]')
    expect(projected).toContain(`originalChars=${content.length}`)
    expect(projected).toContain(`shownChars=${COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS}`)
    expect(projected).toContain(`reason=large_content>${COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS}`)
    expect(projected).toContain(shownPrefix)
    expect(projected).not.toContain(hiddenSuffix)
  })

  it('uses error messages for nullish replay and display content', () => {
    expect(formatToolResultForModel({
      content: undefined,
      error: { message: 'tool failed' }
    })).toBe('tool failed')

    expect(projectToolResultContentForDisplay({
      content: null,
      error: { message: 'render failed' }
    })).toBe('render failed')
  })

  it('serializes display objects and falls back to String on stringify failure', () => {
    expect(projectToolResultContentForDisplay({
      content: { ok: true }
    })).toBe('{"ok":true}')

    expect(projectToolResultContentForDisplay({
      content: { value: 1n }
    })).toBe('[object Object]')
  })

  it('serializes history import arrays and falls back to text parts', () => {
    const projected = projectToolResultContentForHistoryImport([
      { type: 'text', text: 'hello' },
      { type: 'image_url', image_url: { url: 'file://image.png', detail: 'auto' } }
    ])

    expect(projected).toBe(
      '[{"type":"text","text":"hello"},{"type":"image_url","image_url":{"url":"file://image.png","detail":"auto"}}]'
    )

    const circularContent: unknown[] = [
      { type: 'text', text: 'fallback' }
    ]
    circularContent.push(circularContent)

    expect(projectToolResultContentForHistoryImport(
      circularContent as VLMContent[]
    )).toBe('fallback')
  })
})
