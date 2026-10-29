import { beforeEach, describe, expect, it } from 'vitest'
import { useMcpRuntimeStore } from '@renderer/features/settings'
import { collectRunToolSelection } from '../collectRunToolSelection'

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

const state = (webSearchEnable = false): { webSearchEnable: boolean } => ({
  webSearchEnable
})

describe('collectRunToolSelection', () => {
  it('preserves the explicit web search toggle', () => {
    expect(collectRunToolSelection(state(true), {}).webSearchEnabled).toBe(true)
  })
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

    expect(collectRunToolSelection(state(), {})).toEqual({
      webSearchEnabled: false, toolNames: ['alpha__search']
    })
  })

  it('includes tools from all connected mcp servers', () => {
    useMcpRuntimeStore.getState().addServerTools('alpha', [
      mcpTool('alpha', 'search', 'Search alpha')
    ])
    useMcpRuntimeStore.getState().addServerTools('beta', [
      mcpTool('beta', 'search', 'Search beta')
    ])
    useMcpRuntimeStore.getState().addSelectedServer('alpha')

    expect(collectRunToolSelection(state(), {}).toolNames.sort()).toEqual([
      'alpha__search',
      'beta__search'
    ])
  })

  it('deduplicates explicit tool names and leaves schema resolution to Main', () => {
    useMcpRuntimeStore.getState().addServerTools('alpha', [
      mcpTool('alpha', 'shared_tool', 'MCP version')
    ])
    useMcpRuntimeStore.getState().addSelectedServer('alpha')

    expect(collectRunToolSelection(state(), {
      tools: [
        {
          name: 'alpha__shared_tool',
          description: 'Explicit version',
          parameters: { type: 'object' }
        }
      ]
    })).toEqual({ webSearchEnabled: false, toolNames: ['alpha__shared_tool'] })
  })
})
