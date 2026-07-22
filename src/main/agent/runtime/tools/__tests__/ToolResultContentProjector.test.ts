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

  it('truncates inline image content for cold model requests', () => {
    const content = `{"image":"data:image/png;base64,${'a'.repeat(200)}"}`

    const projected = formatToolResultForModel({
      content,
      replayMode: 'cold'
    })

    expect(projected).toContain('[Tool result truncated for model request]')
    expect(projected).toContain('shownChars=0')
    expect(projected).toContain('reason=inline_image')
    expect(projected).not.toContain('data:image/png;base64')
  })

  it('keeps exactly 700 head and 300 tail source characters for cold large text', () => {
    const shownHead = 'h'.repeat(700)
    const omittedMiddle = 'middle-content'
    const shownTail = `${'t'.repeat(291)}tool-tail`
    const content = `${shownHead}${omittedMiddle}${shownTail}`

    const projected = formatToolResultForModel({
      content,
      replayMode: 'cold'
    })

    expect(projected).toContain('[Tool result truncated for model request]')
    expect(projected).toContain(`originalChars=${content.length}`)
    expect(projected).toContain(`shownChars=${COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS}`)
    expect(projected).toContain('shownHeadChars=700')
    expect(projected).toContain('shownTailChars=300')
    expect(projected).toContain(`reason=large_content>${COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS}`)
    expect(projected).toContain('Showing the first 700 and final 300 characters of the tool result.')
    expect(projected).toContain(`${shownHead}\n\n[tool result content omitted]\n\n${shownTail}`)
    expect(projected.split('[tool result content omitted]')).toHaveLength(2)
    expect(projected).not.toContain(omittedMiddle)
    expect(projected).toContain('tool-tail')
  })

  it('passes through exactly 1,000 cold source characters unchanged', () => {
    const content = 'x'.repeat(COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS)

    expect(formatToolResultForModel({
      content,
      replayMode: 'cold'
    })).toBe(content)
  })

  it('truncates 1,001 cold source characters with the head-tail projection', () => {
    const content = `${'h'.repeat(700)}x${'t'.repeat(300)}`
    const projected = formatToolResultForModel({ content, replayMode: 'cold' })

    expect(projected).toContain('originalChars=1001')
    expect(projected).toContain('shownChars=1000')
    expect(projected).toContain('shownHeadChars=700')
    expect(projected).toContain('shownTailChars=300')
    expect(projected).not.toContain(`${'h'.repeat(700)}x`)
    expect(projected).toContain(`${'h'.repeat(700)}\n\n[tool result content omitted]\n\n${'t'.repeat(300)}`)
  })

  it('keeps a trusted semantic compaction intact during cold replay', () => {
    const content = JSON.stringify({
      compacted: true,
      lossy: true,
      result: { summary: 'x'.repeat(5_000) }
    })

    expect(formatToolResultForModel({
      content,
      replayMode: 'cold',
      contentRepresentation: 'semantic_compaction'
    })).toBe(content)
  })

  it('applies the raw cold guard to payloads that spoof representation keys', () => {
    const content = JSON.stringify({
      compacted: true,
      lossy: true,
      ToolResultRepresentation: { mode: 'semantic_compaction' },
      result: 'x'.repeat(5_000)
    })

    const projected = formatToolResultForModel({ content, replayMode: 'cold' })

    expect(projected).toContain('[Tool result truncated for model request]')
    expect(projected).not.toBe(content)
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
