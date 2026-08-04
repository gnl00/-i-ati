import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSoul = vi.fn()
const saveSoul = vi.fn()
const resetSoul = vi.fn()

vi.mock('@main/services/soul/SoulService', () => ({
  soulService: {
    getSoul,
    saveSoul,
    resetSoul
  }
}))

describe('SoulToolsProcessor', () => {
  beforeEach(() => {
    getSoul.mockReset()
    saveSoul.mockReset()
    resetSoul.mockReset()
  })

  it('returns missing action error', async () => {
    const { processSoul } = await import('../SoulToolsProcessor')
    const result = await processSoul({})

    expect(result.success).toBe(false)
    expect(result.message).toBe('Missing required parameter: action')
  })

  it('returns invalid action error', async () => {
    const { processSoul } = await import('../SoulToolsProcessor')
    const result = await processSoul({ action: 'delete' })

    expect(result.success).toBe(false)
    expect(result.message).toBe('Invalid action: delete. Expected one of: get, edit, reset')
  })

  it('dispatches get action to processGetSoul', async () => {
    getSoul.mockReturnValue({
      content: '## Tone\n- calm',
      source: 'config'
    })

    const { processSoul } = await import('../SoulToolsProcessor')
    const result = await processSoul({ action: 'get' }) as any

    expect(result.success).toBe(true)
    expect(result.content).toContain('## Tone')
    expect(result.source).toBe('config')
  })

  it('dispatches edit action to processEditSoul', async () => {
    getSoul.mockReturnValue({
      content: '## Tone\n- calm',
      source: 'config'
    })
    saveSoul.mockReturnValue({
      content: '## Tone\n- direct'
    })

    const { processSoul } = await import('../SoulToolsProcessor')
    const result = await processSoul({
      action: 'edit',
      content: '## Tone\n- direct',
      reason: 'Need more directness'
    }) as any

    expect(result.success).toBe(true)
    expect(result.previousContent).toContain('- calm')
    expect(result.content).toContain('- direct')
    expect(result.reason).toBe('Need more directness')
  })

  it('dispatches reset action to processResetSoul', async () => {
    getSoul.mockReturnValue({
      content: '## Tone\n- custom',
      source: 'config'
    })
    resetSoul.mockReturnValue({
      content: '## Tone\n- calm'
    })

    const { processSoul } = await import('../SoulToolsProcessor')
    const result = await processSoul({ action: 'reset', confirm: true }) as any

    expect(result.success).toBe(true)
    expect(result.previousContent).toContain('- custom')
    expect(result.content).toContain('- calm')
  })

  it('returns current soul content', async () => {
    getSoul.mockReturnValue({
      content: '## Tone\n- calm',
      source: 'config'
    })

    const { processGetSoul } = await import('../SoulToolsProcessor')
    const result = await processGetSoul()

    expect(result.success).toBe(true)
    expect(result.content).toContain('## Tone')
    expect(result.source).toBe('config')
  })

  it('edits soul with previous content included', async () => {
    getSoul.mockReturnValue({
      content: '## Tone\n- calm',
      source: 'config'
    })
    saveSoul.mockReturnValue({
      content: '## Tone\n- direct'
    })

    const { processEditSoul } = await import('../SoulToolsProcessor')
    const result = await processEditSoul({
      content: '## Tone\n- direct',
      reason: 'Need more directness'
    })

    expect(result.success).toBe(true)
    expect(result.previousContent).toContain('- calm')
    expect(result.content).toContain('- direct')
    expect(result.reason).toBe('Need more directness')
  })

  it('rejects reset without confirm=true', async () => {
    const { processResetSoul } = await import('../SoulToolsProcessor')
    const result = await processResetSoul({})

    expect(result.success).toBe(false)
    expect(result.message).toContain('confirm=true')
  })

  it('resets soul to default', async () => {
    getSoul.mockReturnValue({
      content: '## Tone\n- custom',
      source: 'config'
    })
    resetSoul.mockReturnValue({
      content: '## Tone\n- calm'
    })

    const { processResetSoul } = await import('../SoulToolsProcessor')
    const result = await processResetSoul({ confirm: true })

    expect(result.success).toBe(true)
    expect(result.previousContent).toContain('- custom')
    expect(result.content).toContain('- calm')
  })
})
