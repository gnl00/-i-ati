// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantMessageLayout } from '../AssistantMessageLayout'

vi.mock('../AssistantMessageHeader', () => ({
  AssistantMessageHeader: () => null
}))

vi.mock('../AssistantMessageBody', () => ({
  AssistantMessageBody: () => null
}))

vi.mock('../AssistantMessageFooterActions', () => ({
  AssistantMessageFooterActions: () => null
}))

const createLayoutProps = (animateOnMount?: boolean) => ({
  shell: {
    index: 0,
    isLatest: true,
    ...(animateOnMount === undefined ? {} : { animateOnMount }),
    onHover: vi.fn()
  },
  header: {
    header: {},
    badgeAnimate: false
  },
  body: {
    index: 0,
    isLatest: true,
    transcript: {
      isOverlayPreview: false,
      textItems: [],
      supportItems: [],
      supportUnits: []
    },
    textPlayback: {
      committed: {
        role: 'assistant' as const,
        segments: []
      },
      preview: {
        role: 'assistant' as const,
        source: 'stream_preview' as const,
        segments: []
      }
    }
  },
  footer: {
    isHovered: false,
    showOperations: false,
    showRegenerate: false,
    showBranch: false,
    onCopyClick: vi.fn(),
    onRegenerateClick: vi.fn(),
    onBranchClick: vi.fn(),
    onEditClick: vi.fn()
  }
})

describe('AssistantMessageLayout history visibility', () => {
  it('skips the latest shell entrance animation for historical messages', () => {
    const html = renderToStaticMarkup(
      <AssistantMessageLayout {...createLayoutProps(false)} />
    )

    expect(html).not.toContain('animate-assistant-message-in')
  })

  it('keeps the latest shell entrance animation enabled by default', () => {
    const html = renderToStaticMarkup(
      <AssistantMessageLayout {...createLayoutProps()} />
    )

    expect(html).toContain('animate-assistant-message-in')
  })
})
