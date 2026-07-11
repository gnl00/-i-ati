import { describe, expect, it } from 'vitest'
import {
  isAssistantStreamPreviewMessage,
  shouldRenderAssistantMessageShell,
  shouldShowAssistantMessageOperations
} from '../assistant-message-visibility'

describe('shouldRenderAssistantMessageShell', () => {
  it('renders messages with content', () => {
    expect(shouldRenderAssistantMessageShell({
      hasContent: true,
      hasSegments: false,
      hasToolCalls: false,
      isCommandConfirmPending: false,
      isLatest: false,
      isResponseActive: false,
    })).toBe(true)
  })

  it('renders messages with segments', () => {
    expect(shouldRenderAssistantMessageShell({
      hasContent: false,
      hasSegments: true,
      hasToolCalls: true,
      isCommandConfirmPending: false,
      isLatest: false,
      isResponseActive: false,
    })).toBe(true)
  })

  it('keeps a tool-only shell visible while command confirmation is pending', () => {
    expect(shouldRenderAssistantMessageShell({
      hasContent: false,
      hasSegments: false,
      hasToolCalls: true,
      isCommandConfirmPending: true,
      isLatest: true,
      isResponseActive: true,
    })).toBe(true)
  })

  it('keeps a latest tool-only shell visible after accept while the response is still active', () => {
    expect(shouldRenderAssistantMessageShell({
      hasContent: false,
      hasSegments: false,
      hasToolCalls: true,
      isCommandConfirmPending: false,
      isLatest: true,
      isResponseActive: true,
    })).toBe(true)
  })

  it('keeps a latest tool-only shell visible while the response remains active', () => {
    expect(shouldRenderAssistantMessageShell({
      hasContent: false,
      hasSegments: false,
      hasToolCalls: true,
      isCommandConfirmPending: false,
      isLatest: true,
      isResponseActive: true,
    })).toBe(true)
  })

  it('hides a completed tool-only shell once no confirmation or active response remains', () => {
    expect(shouldRenderAssistantMessageShell({
      hasContent: false,
      hasSegments: false,
      hasToolCalls: true,
      isCommandConfirmPending: false,
      isLatest: true,
      isResponseActive: false,
    })).toBe(false)
  })

  it('treats a standalone stream preview row as preview state', () => {
    expect(isAssistantStreamPreviewMessage({
      messageSource: 'stream_preview',
      hasPreviewMessage: false
    })).toBe(true)
    expect(shouldShowAssistantMessageOperations({
      messageSource: 'stream_preview',
      hasPreviewMessage: false
    })).toBe(false)
  })

  it('treats an overlay preview as preview state', () => {
    expect(isAssistantStreamPreviewMessage({
      messageSource: undefined,
      hasPreviewMessage: true
    })).toBe(true)
    expect(shouldShowAssistantMessageOperations({
      messageSource: undefined,
      hasPreviewMessage: true
    })).toBe(false)
  })

  it('keeps operations enabled for committed assistant rows', () => {
    expect(isAssistantStreamPreviewMessage({
      messageSource: undefined,
      hasPreviewMessage: false
    })).toBe(false)
    expect(shouldShowAssistantMessageOperations({
      messageSource: undefined,
      hasPreviewMessage: false
    })).toBe(true)
  })
})
