// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TextSegment } from '../segments/TextSegment'

describe('TextSegment history visibility', () => {
  it('renders historical code-bearing text opaque on the first render', () => {
    const html = renderToStaticMarkup(
      <TextSegment
        segment={{
          type: 'text',
          segmentId: 'historical-code-text',
          content: '```ts\\nconst x = 1\\n```',
          timestamp: 1
        }}
        animateOnChange={false}
        animateOnMount={false}
      />
    )

    const outerClassName = html.match(/^<div class="([^\"]+)"/)?.[1] ?? ''
    expect(outerClassName.split(' ')).toContain('opacity-100')
    expect(outerClassName.split(' ')).not.toContain('opacity-0')
  })

  it('keeps the live code entrance state transparent before it enters', () => {
    const html = renderToStaticMarkup(
      <TextSegment
        segment={{
          type: 'text',
          segmentId: 'live-code-text',
          content: '```ts\\nconst x = 1\\n```',
          timestamp: 1
        }}
        animateOnChange={false}
      />
    )

    const outerClassName = html.match(/^<div class="([^\"]+)"/)?.[1] ?? ''
    expect(outerClassName.split(' ')).toContain('opacity-0')
  })
})
