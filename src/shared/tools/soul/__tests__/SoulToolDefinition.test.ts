import { describe, expect, it } from 'vitest'
import tools from '@tools/definitions'
import type { ToolDefinition } from '@tools/registry'
import { soulTools } from '../definitions'
import { soulToolMetadata } from '../metadata'

describe('soul tool definition', () => {
  it('exposes one flat soul schema with a required action', () => {
    expect(soulTools).toHaveLength(1)

    const soulTool = soulTools[0]
    expect(soulTool.function.name).toBe('soul')
    expect(soulTool.function.parameters.required).toEqual(['action'])
    expect(soulTool.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['get', 'edit', 'reset']
    }))
    expect(soulTool.function.parameters.properties).toEqual(expect.objectContaining({
      content: expect.any(Object),
      reason: expect.any(Object),
      confirm: expect.any(Object)
    }))
  })

  it('keeps only soul in public definitions and metadata', () => {
    const publicSoulDefinitions = (tools as ToolDefinition[])
      .filter(tool => tool.function.name === 'soul')

    expect(publicSoulDefinitions.map(tool => tool.function.name)).toEqual(['soul'])
    expect(publicSoulDefinitions[0].function.parameters.required).toContain('action')
    expect(soulToolMetadata).toEqual({
      soul: {
        capability: 'soul',
        riskLevel: 'none',
        mutatesWorkspace: false,
        subagent: 'deny',
        actionOverrides: {
          get: { capability: 'soul', riskLevel: 'none', mutatesWorkspace: false },
          edit: { capability: 'soul', riskLevel: 'warning', mutatesWorkspace: false },
          reset: { capability: 'soul', riskLevel: 'warning', mutatesWorkspace: false }
        }
      }
    })
  })
})
