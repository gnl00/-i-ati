import { describe, expect, it } from 'vitest'
import { processEmotionReport } from '../EmotionToolsProcessor'

describe('EmotionToolsProcessor', () => {
  it('requires label', async () => {
    const result = await processEmotionReport({})

    expect(result.success).toBe(false)
    expect(result.message).toContain('label is required')
  })

  it('accepts a canonical label and derives emoji from intensity', async () => {
    const result = await processEmotionReport({
      label: 'confusion',
      intensity: 8
    })

    expect(result.success).toBe(true)
    expect(result.label).toBe('confusion')
    expect(result.emoji).toBe('🤨')
    expect(result.intensity).toBe(8)
  })

  it('returns normalized emotion payload', async () => {
    const result = await processEmotionReport({
      label: 'confusion',
      stateText: 'focused',
      intensity: 8,
      reason: 'Working through a packaging issue',
      accumulated: [
        {
          label: 'fear',
          description: 'Lingering worry about packaging stability',
          intensity: 2,
          decay: 0.95
        }
      ]
    })

    expect(result.success).toBe(true)
    expect(result.label).toBe('confusion')
    expect(result.stateText).toBe('focused')
    expect(result.emoji).toBe('🤨')
    expect(result.intensity).toBe(8)
    expect(result.reason).toBe('Working through a packaging issue')
    expect(result.accumulated).toEqual([
      {
        label: 'fear',
        description: 'Lingering worry about packaging stability',
        intensity: 2,
        decay: 0.95
      }
    ])
    expect(result.message).toContain('🤨')
  })

  it('rejects invalid intensity instead of silently clamping', async () => {
    const result = await processEmotionReport({
      label: 'confusion',
      intensity: 12
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('intensity must be an integer between 1 and 10')
  })

  it('rejects invalid accumulated entries', async () => {
    const result = await processEmotionReport({
      label: 'confusion',
      accumulated: [
        {
          label: 'fear',
          description: 'bad',
          intensity: 9,
          decay: 0.95
        }
      ]
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('accumulated[0].intensity must be an integer between 1 and 5')
  })
})
