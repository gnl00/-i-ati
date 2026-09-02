import { describe, expect, it } from 'vitest'
import tools from '../definitions'
import {
  TOOL_CALL_REASON_PARAMETER_NAME,
  mergeToolDefinitions,
  withToolCallReasonDefinition
} from '../definitions-utils'
import type { ToolDefinition } from '../registry'

describe('tool definitions', () => {
  it('keeps tool names unique', () => {
    const toolNames = (tools as ToolDefinition[]).map(tool => tool.function.name)

    expect(new Set(toolNames).size).toBe(toolNames.length)
    expect(toolNames).toHaveLength(64)
  })

  it('exposes one flat wiki definition with a required action enum', () => {
    const wiki = (tools as ToolDefinition[]).find(tool => tool.function.name === 'wiki')
    const wikiNames = (tools as ToolDefinition[])
      .map(tool => tool.function.name)
      .filter(name => name === 'wiki' || name.startsWith('wiki_'))
      .sort()

    expect(wikiNames).toEqual(['wiki'])
    expect(wiki?.function.parameters.required).toContain('action')
    expect(wiki?.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['list', 'read', 'write', 'delete', 'search']
    }))
    expect(wikiNames).toHaveLength(1)
  })

  it('exposes one flat user_info definition with a required action enum', () => {
    const userInfo = (tools as ToolDefinition[]).find(tool => tool.function.name === 'user_info')
    const userInfoNames = (tools as ToolDefinition[])
      .map(tool => tool.function.name)
      .filter(name => name === 'user_info' || name.startsWith('user_info_'))
      .sort()

    expect(userInfoNames).toEqual(['user_info'])
    expect(userInfo?.function.parameters.required).toContain('action')
    expect(userInfo?.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['get', 'set']
    }))
    expect(userInfoNames).toHaveLength(1)
  })

  it('exposes one flat soul definition with a required action enum', () => {
    const soul = (tools as ToolDefinition[]).find(tool => tool.function.name === 'soul')
    const soulNames = (tools as ToolDefinition[])
      .map(tool => tool.function.name)
      .filter(name => name === 'soul' || name.startsWith('soul_'))
      .sort()

    expect(soulNames).toEqual(['soul'])
    expect(soul?.function.parameters.required).toContain('action')
    expect(soul?.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['get', 'edit', 'reset']
    }))
    expect(soulNames).toHaveLength(1)
  })

  it('exposes one flat session_context definition with a required action enum', () => {
    const sessionContext = (tools as ToolDefinition[]).find(tool => tool.function.name === 'session_context')
    const sessionContextNames = (tools as ToolDefinition[])
      .map(tool => tool.function.name)
      .filter(name => name === 'session_context' || name.startsWith('session_context_'))
      .sort()

    expect(sessionContextNames).toEqual(['session_context'])
    expect(sessionContext?.function.parameters.required).toContain('action')
    expect(sessionContext?.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['get', 'set']
    }))
    expect(sessionContextNames).toHaveLength(1)
  })

  it('exposes one flat subagent definition with a required action enum', () => {
    const subagent = (tools as ToolDefinition[]).find(tool => tool.function.name === 'subagent')
    const subagentNames = (tools as ToolDefinition[])
      .map(tool => tool.function.name)
      .filter(name => name === 'subagent' || name.startsWith('subagent_'))
      .sort()

    expect(subagentNames).toEqual(['subagent'])
    expect(subagent?.function.parameters.required).toContain('action')
    expect(subagent?.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['spawn', 'wait']
    }))
    expect(subagentNames).toHaveLength(1)
  })

  it('requires tool_call_reason on all embedded tool definitions', () => {
    for (const tool of tools as ToolDefinition[]) {
      expect(tool.function.parameters.properties[TOOL_CALL_REASON_PARAMETER_NAME]).toEqual(expect.objectContaining({
        type: 'string',
        description: expect.stringContaining('same language the user is currently using')
      }))
      expect(tool.function.parameters.required).toContain(TOOL_CALL_REASON_PARAMETER_NAME)
    }
  })

  it('defines ask_user_question as a bounded recommendation-backed interaction', () => {
    const definition = (tools as ToolDefinition[])
      .find(tool => tool.function.name === 'ask_user_question')

    expect(definition?.function.parameters.properties.questions).toEqual(expect.objectContaining({
      type: 'array',
      minItems: 1,
      maxItems: 3
    }))
    expect(definition?.function.parameters.properties.timeout_seconds).toEqual(expect.objectContaining({
      minimum: 60,
      maximum: 300
    }))
  })

  it('adds tool_call_reason without dropping existing strict schema settings', () => {
    const tool = withToolCallReasonDefinition({
      type: 'function',
      function: {
        name: 'strict_tool',
        description: 'test',
        parameters: {
          type: 'object',
          properties: {
            value: { type: 'string' }
          },
          required: ['value'],
          additionalProperties: false
        }
      }
    })

    expect(tool.function.parameters).toEqual(expect.objectContaining({
      additionalProperties: false,
      required: ['value', TOOL_CALL_REASON_PARAMETER_NAME]
    }))
    expect(tool.function.parameters.properties.value).toEqual({ type: 'string' })
  })

  it('throws on duplicate tool names during merge', () => {
    expect(() =>
      mergeToolDefinitions(
        [
          {
            type: 'function',
            function: {
              name: 'test_tool',
              description: 'test',
              parameters: { type: 'object', properties: {}, required: [] }
            }
          }
        ],
        [
          {
            type: 'function',
            function: {
              name: 'test_tool',
              description: 'test duplicate',
              parameters: { type: 'object', properties: {}, required: [] }
            }
          }
        ]
      )
    ).toThrow('Duplicate tool definition: test_tool')
  })

  it('supports top-level vision image arrays without requiring nested images', () => {
    const tool = (tools as ToolDefinition[])
      .find(candidate => candidate.function.name === 'vision_analyze')

    expect(tool).toBeDefined()
    expect(tool?.function.parameters.properties.image_refs).toEqual(expect.objectContaining({
      type: 'array'
    }))
    expect(tool?.function.parameters.properties.urls).toEqual(expect.objectContaining({
      type: 'array'
    }))
    expect(tool?.function.parameters.properties.raw_data).toEqual(expect.objectContaining({
      type: 'array'
    }))
    expect(tool?.function.parameters.properties.files).toEqual(expect.objectContaining({
      type: 'array'
    }))
    expect(tool?.function.parameters.properties.images.items.properties.file).toEqual(expect.objectContaining({
      type: 'string'
    }))
    expect(tool?.function.parameters.properties.timeout_seconds).toEqual(expect.objectContaining({
      type: 'number',
      minimum: 5,
      maximum: 120
    }))
    expect(tool?.function.parameters.required).toContain('prompt')
    expect(tool?.function.parameters.required).not.toContain('images')
    expect(tool?.function.parameters.additionalProperties).toBe(false)
  })
})
