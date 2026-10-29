import { describe, expect, it, vi } from 'vitest'
import { embeddedToolMetadata } from '@shared/tools/metadata'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'

vi.mock('@main/services/mcpRuntime', () => ({
  mcpRuntimeService: { getRuntimeSnapshot: (): object => ({ servers: [{
    connected: true, tools: [{ function: { name: 'server__read', description: 'Main schema', parameters: {} }, source: 'mcp' }]
  }] }) }
}))

vi.mock('@tools/registry', () => ({
  embeddedToolsRegistry: {
    getAllTools: vi.fn(() => [
      {
        type: 'function',
        source: 'embedded',
        function: {
          name: 'read',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: {
              file_path: { type: 'string' }
            },
            required: ['file_path']
          }
        }
      },
      {
        type: 'function',
        source: 'embedded',
        function: {
          name: 'ask_user_question',
          description: 'Ask a question',
          parameters: { type: 'object', properties: {}, required: [] }
        }
      }
    ])
  }
}))

const conditions = {
  emotionSystemEnabled: true,
  visionAnalysisAvailable: true,
  interactiveInputAvailable: true
}

describe('ToolListBuilder', () => {
  it('requires tool_call_reason for embedded and extra tools', async () => {
    const { ToolListBuilder } = await import('../ToolListBuilder')
    const builder = new ToolListBuilder()

    const tools = builder.build([
      {
        name: 'mcp_search',
        description: 'Search MCP',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query'],
          additionalProperties: false
        },
        source: 'mcp'
      }
    ], { conditions })

    expect(tools).toHaveLength(3)
    for (const tool of tools) {
      expect(tool.parameters.properties[TOOL_CALL_REASON_PARAMETER_NAME]).toEqual(expect.objectContaining({
        type: 'string'
      }))
      expect(tool.parameters.required).toContain(TOOL_CALL_REASON_PARAMETER_NAME)
    }
    expect(tools.find(tool => tool.name === 'mcp_search')?.parameters.additionalProperties).toBe(false)
  })

  it('can exclude interactive tools for external-source runs', async () => {
    const { ToolListBuilder } = await import('../ToolListBuilder')
    const tools = new ToolListBuilder().build(undefined, {
      conditions,
      excludedToolNames: ['ask_user_question']
    })

    expect(tools.map(tool => tool.name)).toEqual(['read'])
  })

  it.each([
    ['emotion_report', 'emotionSystemEnabled'],
    ['image_analyze', 'visionAnalysisAvailable'],
    ['ask_user_question', 'interactiveInputAvailable']
  ] as const)('filters %s and same-name extra tools when %s is false', async (name, requirement) => {
    const { ToolListBuilder } = await import('../ToolListBuilder')
    const { embeddedToolsRegistry } = await import('@tools/registry')
    const definition = {
      type: 'function',
      function: { name, description: 'Conditional tool', parameters: { type: 'object' } }
    }
    const registry = vi.mocked(embeddedToolsRegistry.getAllTools)
    const originalTools = registry()
    registry.mockReturnValueOnce([...originalTools, definition])
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const tools = new ToolListBuilder().build([definition.function, {
      name: 'mcp_search', parameters: { type: 'object' }, source: 'mcp'
    }], { conditions: { ...conditions, [requirement]: false } })
    expect(tools.map(tool => tool.name)).not.toContain(name)
    expect(tools.map(tool => tool.name)).toContain('mcp_search')
    expect(debug).toHaveBeenCalledWith(
      '[ToolListBuilder] Unmet tool requirements:', { [name]: [requirement] }
    )
    debug.mockRestore()

    registry.mockReturnValueOnce([...originalTools, definition])
    const enabled = new ToolListBuilder().build(undefined, { conditions })
    expect(enabled.map(tool => tool.name)).toContain(name)
    expect(enabled.find(tool => tool.name === name)).not.toHaveProperty('requires')
  })

  it('requires every declared condition', async () => {
    const { ToolListBuilder } = await import('../ToolListBuilder')
    const original = embeddedToolMetadata.read
    embeddedToolMetadata.read = {
      ...original, requires: ['emotionSystemEnabled', 'visionAnalysisAvailable']
    }
    try {
      for (const emotionSystemEnabled of [true, false]) {
        for (const visionAnalysisAvailable of [true, false]) {
          const tools = new ToolListBuilder().build(undefined, {
            conditions: { ...conditions, emotionSystemEnabled, visionAnalysisAvailable }
          })
          expect(tools.some(tool => tool.name === 'read')).toBe(
            emotionSystemEnabled && visionAnalysisAvailable
          )
        }
      }
    } finally {
      embeddedToolMetadata.read = original
    }
  })

})

  it('resolves desktop schemas from Main and enforces web search opt-out', async () => {
    const { ToolListBuilder } = await import('../ToolListBuilder')
    const { embeddedToolsRegistry } = await import('@tools/registry')
    vi.mocked(embeddedToolsRegistry.getAllTools).mockReturnValueOnce([
      { type: 'function', function: { name: 'web_search', description: '', parameters: {} } }
    ])
    const tools = new ToolListBuilder().build([{ name: 'server__read', description: 'forged' }], {
      conditions, selection: { webSearchEnabled: false, toolNames: ['server__read'] }
    })
    expect(tools.map(tool => tool.name)).toEqual(['server__read'])
    expect(tools[0].description).toBe('Main schema')
    expect(() => new ToolListBuilder().build(undefined, {
      conditions, selection: { webSearchEnabled: true, toolNames: ['disconnected__tool'] }
    })).toThrow('no longer available')
  })
