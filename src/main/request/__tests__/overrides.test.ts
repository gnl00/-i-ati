import { describe, expect, it } from 'vitest'
import { resolveRequestOverrides } from '@main/request/overrides'

describe('resolveRequestOverrides', () => {
  it('removes title request-specific fields and output_config.effort', () => {
    expect(resolveRequestOverrides({
      temperature: 0.3,
      thinking: { enabled: true },
      reasoning: 'high',
      reasoning_effort: 'minimal',
      tool_choice: { type: 'function', function: { name: 'chat_set_title' } },
      output_config: { effort: 'high', top_p: 0.8 }
    }, 'title')).toEqual({
      temperature: 0.3,
      output_config: { top_p: 0.8 }
    })
  })

  it('removes tool_choice from smart message overrides', () => {
    expect(resolveRequestOverrides({
      temperature: 0.4,
      top_p: 0.8,
      tool_choice: { type: 'function', function: { name: 'generate_smart_messages' } }
    }, 'smartMessage')).toEqual({
      temperature: 0.4,
      top_p: 0.8
    })
  })

  it('removes lightweight compression request-specific fields', () => {
    expect(resolveRequestOverrides({
      temperature: 0.2,
      thinking: { type: 'enabled' },
      reasoning: 'enabled',
      reasoning_effort: 'high',
      tool_choice: 'auto',
      output_config: { effort: 'high', top_k: 10 }
    }, 'compression')).toEqual({
      temperature: 0.2,
      output_config: { top_k: 10 }
    })
  })

  it('keeps request overrides unchanged for non-filtered request kinds', () => {
    const overrides = { temperature: 0.5, tool_choice: { type: 'function', function: { name: 'x' } } }
    expect(resolveRequestOverrides(overrides, 'chat')).toBe(overrides)
  })

  it('handles non-object overrides consistently with request kind behavior', () => {
    expect(resolveRequestOverrides(123 as any, 'smartMessage')).toBe(123)
    expect(resolveRequestOverrides(123 as any, 'title')).toBeUndefined()
    expect(resolveRequestOverrides(123 as any, 'providerTest')).toBe(123)
  })
})
