import { describe, expect, it } from 'vitest'
import tools from '@tools/definitions'
import type { ToolDefinition } from '@tools/registry'
import { sessionContextTools } from '../definitions'
import { sessionContextToolMetadata } from '../metadata'

describe('session_context tool definition', () => {
  it('exposes one flat session_context schema with a required action', () => {
    expect(sessionContextTools).toHaveLength(1)

    const sessionContextTool = sessionContextTools[0]
    expect(sessionContextTool.function.name).toBe('session_context')
    expect(sessionContextTool.function.parameters.required).toEqual(['action'])
    expect(sessionContextTool.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['get', 'set']
    }))
    expect(sessionContextTool.function.parameters.properties).toEqual(expect.objectContaining({
      content: expect.any(Object)
    }))
  })

  it('keeps only session_context in public definitions and metadata', () => {
    const publicSessionContextDefinitions = (tools as ToolDefinition[])
      .filter(tool => tool.function.name === 'session_context')

    expect(publicSessionContextDefinitions.map(tool => tool.function.name)).toEqual(['session_context'])
    expect(publicSessionContextDefinitions[0].function.parameters.required).toContain('action')
    expect(sessionContextToolMetadata).toEqual({
      session_context: {
        capability: 'memory',
        riskLevel: 'none',
        mutatesWorkspace: false,
        subagent: 'deny',
        actionOverrides: {
          get: { capability: 'memory', riskLevel: 'none', mutatesWorkspace: false },
          set: { capability: 'memory', riskLevel: 'none', mutatesWorkspace: false }
        }
      }
    })
  })
})
