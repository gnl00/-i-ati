import { describe, expect, it } from 'vitest'
import { mergeUsage } from '../AgentLoopUsage'

describe('mergeUsage', () => {
  it('returns the available usage when either side is empty', () => {
    const usage: ITokenUsage = {
      promptTokens: 10,
      completionTokens: 2,
      totalTokens: 12,
      promptCacheHitTokens: 8
    }

    expect(mergeUsage(undefined, usage)).toEqual(usage)
    expect(mergeUsage(usage, undefined)).toEqual(usage)
  })

  it('adds required and optional token counts across steps', () => {
    expect(mergeUsage(
      {
        promptTokens: 10,
        completionTokens: 2,
        totalTokens: 12,
        promptCacheHitTokens: 6,
        promptCacheMissTokens: 4,
        promptCacheWriteTokens: 3,
        reasoningTokens: 1
      },
      {
        promptTokens: 20,
        completionTokens: 5,
        totalTokens: 25,
        promptCacheHitTokens: 16,
        promptCacheMissTokens: 4,
        promptCacheWriteTokens: 7,
        reasoningTokens: 2
      }
    )).toEqual({
      promptTokens: 30,
      completionTokens: 7,
      totalTokens: 37,
      promptCacheHitTokens: 22,
      promptCacheMissTokens: 8,
      promptCacheWriteTokens: 10,
      reasoningTokens: 3
    })
  })

  it('keeps optional token counts from the step that provides them', () => {
    expect(mergeUsage(
      {
        promptTokens: 10,
        completionTokens: 2,
        totalTokens: 12,
        promptCacheHitTokens: 6
      },
      {
        promptTokens: 20,
        completionTokens: 5,
        totalTokens: 25,
        promptCacheMissTokens: 4,
        reasoningTokens: 2
      }
    )).toEqual({
      promptTokens: 30,
      completionTokens: 7,
      totalTokens: 37,
      promptCacheHitTokens: 6,
      promptCacheMissTokens: 4,
      reasoningTokens: 2
    })
  })
})
