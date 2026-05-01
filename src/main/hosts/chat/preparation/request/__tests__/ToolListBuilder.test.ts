import { describe, expect, it, vi } from 'vitest'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'

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
      }
    ])
  }
}))

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
    ])

    expect(tools).toHaveLength(2)
    for (const tool of tools) {
      expect(tool.parameters.properties[TOOL_CALL_REASON_PARAMETER_NAME]).toEqual(expect.objectContaining({
        type: 'string'
      }))
      expect(tool.parameters.required).toContain(TOOL_CALL_REASON_PARAMETER_NAME)
    }
    expect(tools.find(tool => tool.name === 'mcp_search')?.parameters.additionalProperties).toBe(false)
  })
})
