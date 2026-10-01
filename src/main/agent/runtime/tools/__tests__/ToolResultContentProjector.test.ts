import { describe, expect, it } from 'vitest'
import {
  formatToolResultForModel,
  projectToolResultContentForDisplay
} from '../ToolResultContentProjector'
import { createToolFailure } from '@shared/tools/toolFailure'

describe('ToolResultContentProjector', () => {
  it('keeps raw program values separate from stable model content', () => {
    const content = { ok: true, value: 'x'.repeat(40_000) }
    expect(projectToolResultContentForDisplay({ content })).toBe(JSON.stringify(content))
    expect(formatToolResultForModel({ content, modelContent: 'saved preview' })).toBe(
      'saved preview'
    )
  })
  it('formats failure and empty output consistently', () => {
    const failure = createToolFailure({
      category: 'operation',
      code: 'TEST',
      message: 'failed',
      recovery: { action: 'change_strategy', message: 'inspect' }
    })
    expect(formatToolResultForModel({ content: 'log', failure })).toContain('code=TEST')
    expect(formatToolResultForModel({ content: null, error: { message: 'failed' } })).toBe('failed')
    expect(formatToolResultForModel({ content: '' })).toBe('[Tool completed with no output]')
  })
})
