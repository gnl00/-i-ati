import { describe, expect, it } from 'vitest'
import tools from '@tools/definitions'
import type { ToolDefinition } from '@tools/registry'
import { userInfoTools } from '../definitions'
import { userInfoToolMetadata } from '../metadata'

describe('user_info tool definition', () => {
  it('exposes one flat user_info schema with a required action', () => {
    expect(userInfoTools).toHaveLength(1)

    const userInfoTool = userInfoTools[0]
    expect(userInfoTool.function.name).toBe('user_info')
    expect(userInfoTool.function.parameters.required).toEqual(['action'])
    expect(userInfoTool.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['get', 'set']
    }))
    expect(userInfoTool.function.parameters.properties).toEqual(expect.objectContaining({
      name: expect.any(Object),
      preferredAddress: expect.any(Object),
      basicInfo: expect.any(Object),
      preferences: expect.any(Object)
    }))
  })

  it('keeps only user_info in public definitions and metadata', () => {
    const publicUserInfoDefinitions = (tools as ToolDefinition[])
      .filter(tool => tool.function.name === 'user_info')

    expect(publicUserInfoDefinitions.map(tool => tool.function.name)).toEqual(['user_info'])
    expect(publicUserInfoDefinitions[0].function.parameters.required).toContain('action')
    expect(userInfoToolMetadata).toEqual({
      user_info: {
        capability: 'user_info',
        riskLevel: 'none',
        mutatesWorkspace: false,
        subagent: 'deny',
        actionOverrides: {
          get: { capability: 'user_info', riskLevel: 'none', mutatesWorkspace: false },
          set: { capability: 'user_info', riskLevel: 'warning', mutatesWorkspace: false }
        }
      }
    })
  })
})
