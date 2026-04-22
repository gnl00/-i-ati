import { beforeEach, describe, expect, it } from 'vitest'
import { useMcpRuntimeStore } from '@renderer/store/mcpRuntime'
import { collectRunTools } from '../collectRunTools'

const mcpTool = (
  serverName: string,
  originalName: string,
  description: string
): MCPTool => ({
  type: 'function',
  source: 'mcp',
  serverName,
  originalName,
  function: {
    name: `${serverName}__${originalName}`,
    description,
    parameters: {
      type: 'object',
      properties: {}
    }
  }
})

const state = (webSearchEnable = false) => ({
  webSearchEnable
} as any)

describe('collectRunTools', () => {
  beforeEach(() => {
    useMcpRuntimeStore.setState({
      availableMcpTools: new Map(),
      selectedServerNames: [],
      connectingServerNames: [],
      lastErrorByServer: {}
    })
  })

  it('includes tools from selected mcp servers', () => {
    useMcpRuntimeStore.getState().addServerTools('alpha', [
      mcpTool('alpha', 'search', 'Search alpha')
    ])
    useMcpRuntimeStore.getState().addSelectedServer('alpha')

    expect(collectRunTools(state(), {})).toEqual([
      {
        name: 'alpha__search',
        description: 'Search alpha',
        parameters: {
          type: 'object',
          properties: {}
        },
        source: 'mcp',
        serverName: 'alpha',
        originalName: 'search'
      }
    ])
  })

  it('limits mcp tools to selected servers', () => {
    useMcpRuntimeStore.getState().addServerTools('alpha', [
      mcpTool('alpha', 'search', 'Search alpha')
    ])
    useMcpRuntimeStore.getState().addServerTools('beta', [
      mcpTool('beta', 'search', 'Search beta')
    ])
    useMcpRuntimeStore.getState().addSelectedServer('alpha')

    expect(collectRunTools(state(), {}).map(tool => tool.name)).toEqual([
      'alpha__search'
    ])
  })

  it('lets explicit run tools override selected mcp tools with the same name', () => {
    useMcpRuntimeStore.getState().addServerTools('alpha', [
      mcpTool('alpha', 'shared_tool', 'MCP version')
    ])
    useMcpRuntimeStore.getState().addSelectedServer('alpha')

    expect(collectRunTools(state(), {
      tools: [
        {
          name: 'alpha__shared_tool',
          description: 'Explicit version',
          parameters: { type: 'object' }
        }
      ]
    })).toEqual([
      {
        name: 'alpha__shared_tool',
        description: 'Explicit version',
        parameters: { type: 'object' }
      }
    ])
  })
})
