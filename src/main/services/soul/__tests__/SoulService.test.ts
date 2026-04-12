import { beforeEach, describe, expect, it, vi } from 'vitest'

const getConfigValue = vi.fn()
const saveConfigValue = vi.fn()

vi.mock('@main/db/config', () => ({
  configDb: {
    getConfigValue,
    saveConfigValue
  }
}))

describe('SoulService', () => {
  beforeEach(() => {
    getConfigValue.mockReset()
    saveConfigValue.mockReset()
  })

  it('returns default soul when config value is missing', async () => {
    getConfigValue.mockReturnValue(undefined)
    const { soulService } = await import('../SoulService')

    const soul = soulService.getSoul()

    expect(soul.source).toBe('default')
    expect(soul.content).toContain('## Tone')
  })

  it('returns config soul when persisted value exists', async () => {
    getConfigValue.mockReturnValue('## Tone\n- custom')
    const { soulService } = await import('../SoulService')

    const soul = soulService.getSoul()

    expect(soul.source).toBe('config')
    expect(soul.content).toBe('## Tone\n- custom')
  })

  it('accepts arbitrary markdown structure as long as content is non-empty', async () => {
    const { soulService } = await import('../SoulService')

    const result = soulService.validateSoulContent('## Tone\n- calm\n\n## Boundaries\n- stay direct')

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.normalizedContent).toContain('## Boundaries')
    }
  })

  it('saves normalized content', async () => {
    const { soulService, SOUL_CONFIG_KEY } = await import('../SoulService')

    const saved = soulService.saveSoul('## Tone\r\n- calm\r\n\r\n## Values\r\n- truth')

    expect(saved.content).toBe('## Tone\n- calm\n\n## Values\n- truth')
    expect(saveConfigValue).toHaveBeenCalledWith(
      SOUL_CONFIG_KEY,
      '## Tone\n- calm\n\n## Values\n- truth'
    )
  })

  it('resets soul to default content', async () => {
    const { soulService, SOUL_CONFIG_KEY } = await import('../SoulService')

    const reset = soulService.resetSoul()

    expect(reset.content).toContain('## Collaboration Style')
    expect(saveConfigValue).toHaveBeenCalledWith(
      SOUL_CONFIG_KEY,
      expect.stringContaining('## Tone')
    )
  })
})
