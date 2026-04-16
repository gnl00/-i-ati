import { describe, expect, it, vi } from 'vitest'
import { buildAssistantMessageLayoutModels } from '../model/assistantMessageLayoutModels'

describe('buildAssistantMessageLayoutModels', () => {
  it('projects shell, header, body, and footer models from pure inputs', () => {
    const onHover = vi.fn()
    const onTypingChange = vi.fn()
    const onCopyClick = vi.fn()
    const onRegenerateClick = vi.fn()
    const onEditClick = vi.fn()
    const onConfirmCommand = vi.fn()
    const onCancelCommand = vi.fn()

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
      headerProjection: {
        badgeModel: 'gpt-5',
        modelProvider: 'openai'
      },
      transcriptProjection: {
        isOverlayPreview: true,
        textItems: [],
        supportItems: []
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
      commandState: {
        commandConfirmationRequest: {
          command: 'ls',
          risk_level: 'risky',
          execution_reason: 'Inspect files',
          possible_risk: 'Reads local files',
          pending_count: 1
        },
      },
      footerState: {
        showOperations: true,
        showRegenerate: true
      },
      badgeAnimate: true,
      onCopyClick,
      onRegenerateClick,
      onEditClick,
      onConfirmCommand,
      onCancelCommand
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
    expect(models.body.commandConfirmationRequest?.command).toBe('ls')
    expect(models.body.onConfirmCommand).toBe(onConfirmCommand)
    expect(models.footer).toEqual({
      messageMeta: undefined,
      isHovered: true,
      showOperations: true,
      showRegenerate: true,
      onCopyClick,
      onRegenerateClick,
      onEditClick
    })
  })
})
