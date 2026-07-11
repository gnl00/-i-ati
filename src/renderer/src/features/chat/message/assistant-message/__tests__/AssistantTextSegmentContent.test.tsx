// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantTextSegmentContent } from '../renderers/AssistantTextSegmentContent'

vi.mock('../segments/TextSegment', () => ({
  TextSegment: ({
    segment,
    visibleText,
    animateOnChange
  }: {
    segment: TextSegment
    visibleText?: string
    animateOnChange?: boolean
  }) => (
    <div
      data-testid="text-segment"
      data-content={visibleText ?? segment.content}
      data-animate={animateOnChange ? 'yes' : 'no'}
    />
  )
}))

vi.mock('../../typewriter/StreamingMarkdownSwitch', () => ({
  StreamingMarkdownSwitch: ({
    text,
    visibleText,
    isTyping
  }: {
    text: string
    visibleText?: string
    isTyping: boolean
  }) => (
    <div
      data-testid="streaming-markdown"
      data-text={text}
      data-visible={visibleText ?? ''}
      data-typing={isTyping ? 'yes' : 'no'}
    />
  )
}))

describe('AssistantTextSegmentContent', () => {
  afterEach(() => {
    delete (globalThis as any).__STREAMING_TEXT_RENDER_MODE
  })

  it('routes code content through TextSegment without animateOnChange', () => {
    const html = renderToStaticMarkup(
      <AssistantTextSegmentContent
        segment={{
          type: 'text',
          segmentId: 'code-text',
          content: '```ts\\nconst x = 1\\n```',
          timestamp: 1
        }}
        visibleText={'```ts\\nconst x = 1\\n```'}
        isTyping={true}
      />
    )

    expect(html).toContain('data-testid="text-segment"')
    expect(html).toContain('data-animate="no"')
  })

  it('routes plain text through TextSegment in markdown mode', () => {
    ;(globalThis as any).__STREAMING_TEXT_RENDER_MODE = 'markdown'

    const html = renderToStaticMarkup(
      <AssistantTextSegmentContent
        segment={{
          type: 'text',
          segmentId: 'plain-text',
          content: 'hello world',
          timestamp: 1
        }}
        visibleText="hello world"
        isTyping={true}
      />
    )

    expect(html).toContain('data-testid="text-segment"')
    expect(html).toContain('data-content="hello world"')
    expect(html).toContain('data-animate="yes"')
  })

  it('routes plain text through StreamingMarkdownSwitch in switch mode', () => {
    const html = renderToStaticMarkup(
      <AssistantTextSegmentContent
        segment={{
          type: 'text',
          segmentId: 'switch-text',
          content: 'hello world',
          timestamp: 1
        }}
        visibleText="hello world"
        isTyping={true}
      />
    )

    expect(html).toContain('data-testid="streaming-markdown"')
    expect(html).toContain('data-text="hello world"')
    expect(html).toContain('data-visible="hello world"')
    expect(html).toContain('data-typing="yes"')
  })
})
