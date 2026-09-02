import { describe, expect, it } from 'vitest'
import { processEmotionReport } from '../EmotionToolsProcessor'

describe('EmotionToolsProcessor', () => {
  it('requires all three signed stimulus dimensions', async () => {
    const result = await processEmotionReport({ impact: 1, activation: 0 })

    expect(result.success).toBe(false)
    expect(result.message).toContain('impact, activation, and control')
  })

  it('accepts boundary integers and returns one normalized stimulus object', async () => {
    const result = await processEmotionReport({
      impact: -2,
      activation: 0,
      control: 2
    })

    expect(result).toEqual({
      success: true,
      stimulus: {
        impact: -2,
        activation: 0,
        control: 2
      },
      message: 'Emotion stimulus recorded: impact=-2, activation=0, control=2.'
    })
  })

  it.each([
    { impact: -3, activation: 0, control: 0 },
    { impact: 0.5, activation: 0, control: 0 },
    { impact: 0, activation: Number.NaN, control: 0 },
    { impact: 0, activation: 0, control: 3 }
  ])('rejects invalid stimulus values: $impact/$activation/$control', async (args) => {
    const result = await processEmotionReport(args)

    expect(result.success).toBe(false)
    expect(result.message).toContain('integer between -2 and 2')
  })

  it('keeps the processor stateless and never returns a resolved emotion', async () => {
    const result = await processEmotionReport({ impact: 0, activation: 0, control: 0 })

    expect(result).not.toHaveProperty('label')
    expect(result).not.toHaveProperty('intensity')
    expect(result).not.toHaveProperty('emoji')
    expect(result).not.toHaveProperty('stateText')
    expect(result).not.toHaveProperty('reason')
    expect(result).not.toHaveProperty('accumulated')
  })

  it('rejects fields outside the stimulus contract', async () => {
    const result = await processEmotionReport({
      impact: 0,
      activation: 0,
      control: 0,
      label: 'happiness'
    } as Parameters<typeof processEmotionReport>[0])

    expect(result.success).toBe(false)
    expect(result.message).toContain('accepts only')
  })
})
