import { describe, expect, it } from 'vitest'
import { shouldRenderAssistantMessageShell } from '../assistant-message-visibility'

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
})
