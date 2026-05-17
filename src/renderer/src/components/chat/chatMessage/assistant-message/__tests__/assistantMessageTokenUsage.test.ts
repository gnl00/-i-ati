import { describe, expect, it } from 'vitest'
import { buildAssistantMessageTokenUsageDisplay } from '../model/assistantMessageTokenUsage'

describe('buildAssistantMessageTokenUsageDisplay', () => {
  it('formats input, output and cache token counts', () => {
    expect(buildAssistantMessageTokenUsageDisplay({
      promptTokens: 164842,
      completionTokens: 331,
      totalTokens: 165173,
      promptCacheHitTokens: 88576
    })).toEqual({
      compactLabel: 'Usage 165.2k',
      tooltipItems: [
        'Total tokens: 165.2k',
        'Input tokens: 164.8k',
        'Output tokens: 0.3k',
        'Cache hit tokens: 88.6k',
        'Cache hit rate: 54%'
      ],
      ariaLabel: 'Total tokens 165.2k, Input tokens 164.8k, Output tokens 0.3k, Cache hit tokens 88.6k, Cache hit rate 54%'
    })
  })

  it('uses zero cache tokens when cache details are absent', () => {
    expect(buildAssistantMessageTokenUsageDisplay({
      promptTokens: 82578,
      completionTokens: 82,
      totalTokens: 82660
    })).toEqual({
      compactLabel: 'Usage 82.7k',
      tooltipItems: [
        'Total tokens: 82.7k',
        'Input tokens: 82.6k',
        'Output tokens: 0.1k',
        'Cache hit tokens: 0k',
        'Cache hit rate: 0%'
      ],
      ariaLabel: 'Total tokens 82.7k, Input tokens 82.6k, Output tokens 0.1k, Cache hit tokens 0k, Cache hit rate 0%'
    })
  })
})
