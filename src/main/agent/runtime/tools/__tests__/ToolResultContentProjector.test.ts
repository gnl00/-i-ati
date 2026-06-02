import { describe, expect, it } from 'vitest'
import {
  projectToolResultContentForDisplay,
  projectToolResultContentForHistoryImport,
  projectToolResultContentForModelReplay
} from '../ToolResultContentProjector'
import type { NormalizedToolResultContent } from '../result-normalization'

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

    expect(projectToolResultContentForModelReplay({ content })).toBe('[normalized model content]')
  })

  it('keeps hot replay content uncompressed', () => {
    const content = `{"image":"data:image/png;base64,${'a'.repeat(200)}"}`

    expect(projectToolResultContentForModelReplay({
      content,
      replayMode: 'hot'
    })).toBe(content)
  })

  it('compacts cold replay content for model requests', () => {
    const content = `{"image":"data:image/png;base64,${'a'.repeat(200)}"}`

    expect(projectToolResultContentForModelReplay({
      content,
      replayMode: 'cold'
    })).toContain('[Tool result compacted for model request]')
  })

  it('uses error messages for nullish replay and display content', () => {
    expect(projectToolResultContentForModelReplay({
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

    const circularContent = [
      { type: 'text', text: 'fallback' }
    ] as unknown as Array<VLMContent | VLMContent[]>
    circularContent.push(circularContent)

    expect(projectToolResultContentForHistoryImport(
      circularContent as VLMContent[]
    )).toBe('fallback')
  })
})
