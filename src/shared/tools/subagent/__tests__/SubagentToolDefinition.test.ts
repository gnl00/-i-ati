import { describe, expect, it } from 'vitest'
import tools from '@tools/definitions'
import type { ToolDefinition } from '@tools/registry'
import { subagentTools } from '../definitions'
import { subagentToolMetadata } from '../metadata'

describe('subagent tool definition', () => {
  it('exposes one flat subagent schema with a required action', () => {
    expect(subagentTools).toHaveLength(1)

    const subagentTool = subagentTools[0]
    expect(subagentTool.function.name).toBe('subagent')
    expect(subagentTool.function.parameters.required).toEqual(['action'])
    expect(subagentTool.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['spawn', 'wait']
    }))
    expect(subagentTool.function.parameters.properties).toEqual(expect.objectContaining({
      task: expect.any(Object),
      role: expect.any(Object),
      context_mode: expect.any(Object),
      files: expect.any(Object),
      background: expect.any(Object),
      subagent_id: expect.any(Object),
      timeout_seconds: expect.any(Object)
    }))
  })

  it('keeps only subagent in public definitions and metadata', () => {
    const publicSubagentDefinitions = (tools as ToolDefinition[])
      .filter(tool => tool.function.name === 'subagent')

    expect(publicSubagentDefinitions.map(tool => tool.function.name)).toEqual(['subagent'])
    expect(publicSubagentDefinitions[0].function.parameters.required).toContain('action')
    expect(subagentToolMetadata).toEqual({
      subagent: {
        capability: 'subagent',
        riskLevel: 'warning',
        mutatesWorkspace: false,
        subagent: 'deny',
        actionOverrides: {
          spawn: { capability: 'subagent', riskLevel: 'warning', mutatesWorkspace: false },
          wait: { capability: 'subagent', riskLevel: 'none', mutatesWorkspace: false }
        }
      }
    })
  })
})
