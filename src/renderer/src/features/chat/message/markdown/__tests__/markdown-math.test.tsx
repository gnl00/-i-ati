// @vitest-environment happy-dom

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TextSegment } from '../../assistant-message/segments/TextSegment'
import { StreamingMarkdownSwitch } from '../../typewriter/StreamingMarkdownSwitch'
import { UserMessage } from '../../user-message'

vi.mock('@renderer/shared/components/ui/message-scroller', () => ({
  useMessageScroller: (): { scrollToMessage: ReturnType<typeof vi.fn> } => ({
    scrollToMessage: vi.fn(),
  }),
}))

vi.mock('../../message-operations', () => ({
  MessageOperations: (): null => null,
}))

const renderers = [
  {
    name: 'StreamingMarkdownSwitch',
    render: (content: string): React.ReactElement => (
      <StreamingMarkdownSwitch text={content} isTyping={false} />
    ),
  },
  {
    name: 'TextSegment',
    render: (content: string): React.ReactElement => (
      <TextSegment
        segment={{
          type: 'text',
          segmentId: 'math-test',
          timestamp: 1,
          content,
        }}
        animateOnMount={false}
      />
    ),
  },
  {
    name: 'UserMessage',
    render: (content: string): React.ReactElement => (
      <UserMessage
        index={0}
        message={{ role: 'user', content, segments: [] }}
        isLatest={false}
        isHovered={false}
        onHover={() => {}}
        onCopyClick={() => {}}
      />
    ),
  },
]

function renderContent(
  render: (content: string) => React.ReactElement,
  content: string,
): HTMLDivElement {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(render(content))
  return container
}

describe.each(renderers)('$name math delimiters', ({ render }) => {
  it('preserves dollar prices and the text between them without rendering math', () => {
    const content =
      'Cursor Pro（$20 / 月）。这些是 SEO 站内容，直接去 x.ai/bot ——旧价（比如 "$60 起"）。SuperGrok $30 / Plus $100 / Heavy $300'
    const container = renderContent(render, content)

    expect(container.textContent).toBe(content)
    expect(container.querySelector('.katex')).toBeNull()
  })

  it('preserves single-dollar expressions as literal text', () => {
    const container = renderContent(
      render,
      'The expression $x^2$ stays literal.',
    )

    expect(container.textContent).toBe('The expression $x^2$ stays literal.')
    expect(container.querySelector('.katex')).toBeNull()
  })

  it('renders double-dollar inline math with KaTeX', () => {
    const container = renderContent(
      render,
      'The expression $$x^2$$ is inline.',
    )

    expect(container.querySelectorAll('.katex')).toHaveLength(1)
    expect(
      container.querySelector('annotation[encoding="application/x-tex"]')
        ?.textContent,
    ).toBe('x^2')
    expect(container.querySelector('.katex-display')).toBeNull()
    expect(container.querySelector('.katex-error')).toBeNull()
  })

  it('renders double-dollar block math with KaTeX', () => {
    const container = renderContent(render, '$$\nx^2\n$$')

    expect(container.querySelectorAll('.katex-display .katex')).toHaveLength(1)
    expect(
      container.querySelector('annotation[encoding="application/x-tex"]')
        ?.textContent,
    ).toBe('x^2')
    expect(container.querySelector('.katex-error')).toBeNull()
  })
})
