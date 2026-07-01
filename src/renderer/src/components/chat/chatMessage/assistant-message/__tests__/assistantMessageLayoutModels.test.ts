import { describe, expect, it, vi } from 'vitest'
import { buildAssistantMessageLayoutModels } from '../model/assistantMessageLayoutModels'

describe('buildAssistantMessageLayoutModels', () => {
  it('projects shell, header, body, and footer models from pure inputs', () => {
    const onHover = vi.fn()
    const onTypingChange = vi.fn()
    const onCopyClick = vi.fn()
    const onRegenerateClick = vi.fn()
    const onEditClick = vi.fn()

    const models = buildAssistantMessageLayoutModels({
      index: 3,
      isLatest: true,
      isHovered: true,
      onHover,
      onTypingChange,
      committedMessage: {
        role: 'assistant',
        content: 'hello',
        segments: []
      },
      tokenUsage: {
        promptTokens: 164842,
        completionTokens: 331,
        totalTokens: 165173,
        promptCacheHitTokens: 88576
      },
      headerProjection: {
        badgeModel: 'gpt-5',
        modelProvider: 'openai'
      },
      transcriptProjection: {
        isOverlayPreview: true,
        textItems: [],
        supportItems: [],
        supportUnits: []
      },
      textPlayback: {
        committed: {
          role: 'assistant',
          segments: []
        },
        preview: {
          role: 'assistant',
          source: 'stream_preview',
          segments: []
        }
      },
      footerState: {
        showOperations: true,
        showRegenerate: true
      },
      badgeAnimate: true,
      onCopyClick,
      onRegenerateClick,
      onEditClick
    })

    expect(models.shell).toEqual({
      index: 3,
      isLatest: true,
      onHover
    })
    expect(models.header).toEqual({
      header: {
        badgeModel: 'gpt-5',
        modelProvider: 'openai'
      },
      badgeAnimate: true
    })
    expect(models.body.transcript.isOverlayPreview).toBe(true)
    expect(models.footer).toEqual({
      messageMeta: undefined,
      tokenUsageDisplay: {
        compactLabel: 'Usage 165.2k',
        tooltipItems: [
          'Total tokens: 165.2k',
          'Input tokens: 164.8k',
          'Output tokens: 0.3k',
          'Cache hit tokens: 88.6k',
          'Cache hit rate: 54%'
        ],
        ariaLabel: 'Total tokens 165.2k, Input tokens 164.8k, Output tokens 0.3k, Cache hit tokens 88.6k, Cache hit rate 54%'
      },
      isHovered: true,
      showOperations: true,
      showRegenerate: true,
      onCopyClick,
      onRegenerateClick,
      onEditClick
    })
  })
})
