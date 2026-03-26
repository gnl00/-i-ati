import { describe, expect, it } from 'vitest'
import { processEmotionReport } from '../EmotionToolsProcessor'

describe('EmotionToolsProcessor', () => {
  it('requires state', async () => {
    const result = await processEmotionReport({})

    expect(result.success).toBe(false)
    expect(result.message).toContain('label is required')
  })

  it('requires emoji', async () => {
    const result = await processEmotionReport({
      label: 'neutral'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('emojiName is required')
  })

  it('accepts a representative telegram emotion asset name', async () => {
    const result = await processEmotionReport({
      label: 'confusion',
      emojiName: 'Thinking Face'
    })

    expect(result.success).toBe(true)
    expect(result.label).toBe('confusion')
    expect(result.emojiName).toBe('Thinking Face')
    expect(result.emoji).toBe('🤔')
  })

  it('returns normalized emotion payload', async () => {
    const result = await processEmotionReport({
      label: 'confusion',
      stateText: 'focused',
      emojiName: 'Thinking Face',
      intensity: 12,
      reason: 'Working through a packaging issue'
    })

    expect(result.success).toBe(true)
    expect(result.label).toBe('confusion')
    expect(result.stateText).toBe('focused')
    expect(result.emojiName).toBe('Thinking Face')
    expect(result.emoji).toBe('🤔')
    expect(result.intensity).toBe(10)
    expect(result.reason).toBe('Working through a packaging issue')
    expect(result.message).toContain('🤔')
  })

  it('rejects emojiName that does not match the selected label', async () => {
    const result = await processEmotionReport({
      label: 'happiness',
      emojiName: 'Thinking Face'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('does not match label happiness')
  })
})
