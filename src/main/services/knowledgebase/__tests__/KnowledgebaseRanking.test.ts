import { describe, expect, it } from 'vitest'
import { computeSearchRankingSignals } from '../ranking'

describe('knowledgebase ranking signals', () => {
  it('adds heading score when query matches markdown heading paths', () => {
    const withHeading = computeSearchRankingSignals({
      query: '分布式锁',
      text: '# Redis\n## 概览\n这里介绍锁的基础原理。',
      filePath: '/workspace/docs/redis-lock.md',
      fileName: 'redis-lock.md',
      headingPaths: ['# Redis\n## 分布式锁\n### Redisson 实现']
    })

    const withoutHeading = computeSearchRankingSignals({
      query: '分布式锁',
      text: '# Redis\n## 概览\n这里介绍锁的基础原理。',
      filePath: '/workspace/docs/redis-lock.md',
      fileName: 'redis-lock.md'
    })

    expect(withHeading.exactHeadingHit).toBe(true)
    expect(withHeading.headingCoverage).toBeGreaterThan(0)
    expect(withHeading.headingScore).toBeGreaterThan(withoutHeading.headingScore)
    expect(withHeading.lexicalScore).toBeGreaterThan(withoutHeading.lexicalScore)
  })

  it('gives deeper heading matches a stronger bonus', () => {
    const shallow = computeSearchRankingSignals({
      query: 'redisson',
      text: '这里是正文。',
      filePath: '/workspace/docs/redis-lock.md',
      fileName: 'redis-lock.md',
      headingPaths: ['# Redisson']
    })

    const deep = computeSearchRankingSignals({
      query: 'redisson',
      text: '这里是正文。',
      filePath: '/workspace/docs/redis-lock.md',
      fileName: 'redis-lock.md',
      headingPaths: ['# Redis\n## 分布式锁\n### Redisson']
    })

    expect(deep.exactHeadingHit).toBe(true)
    expect(deep.headingDepthBonus).toBeGreaterThan(shallow.headingDepthBonus)
    expect(deep.headingScore).toBeGreaterThan(shallow.headingScore)
  })
})
