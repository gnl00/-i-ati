import { describe, expect, it, vi } from 'vitest'
import type { ToolResultCompactor } from '../contracts'
import { ToolResultCompactorRegistry } from '../ToolResultCompactorRegistry'

const input = {
  messageId: 1,
  toolName: 'any_tool_name',
  status: 'success' as const,
  rawContent: { content: 'result' },
  level: 'balanced' as const
}

describe('ToolResultCompactorRegistry', () => {
  it('routes exclusively by compactor id', async () => {
    const compact = vi.fn().mockResolvedValue({
      content: 'compact',
      compactorId: 'fixture',
      compactorVersion: 1,
      originalCharacters: 20,
      compactedCharacters: 7,
      estimatedTokens: 2
    })
    const compactor: ToolResultCompactor = { id: 'fixture', version: 1, compact }
    const registry = new ToolResultCompactorRegistry([compactor])

    await expect(registry.compact('fixture', input)).resolves.toMatchObject({
      compactorId: 'fixture'
    })
    expect(registry.get('fixture')).toMatchObject({ id: 'fixture', version: 1 })
    expect(compact).toHaveBeenCalledWith(input)
  })

  it('returns undefined for an unregistered compactor id', async () => {
    const registry = new ToolResultCompactorRegistry()

    await expect(registry.compact('missing', input)).resolves.toBeUndefined()
  })
})
