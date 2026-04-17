import { describe, expect, it } from 'vitest'
import tools from '../definitions'
import { embeddedToolMetadata } from '../metadata'
import { mergeEmbeddedToolMetadata } from '../metadata-utils'
import type { ToolDefinition } from '../registry'

const INTERNAL_ONLY_TOOL_NAMES = ['list_allowed_directories']

describe('embeddedToolMetadata', () => {
  it('stays aligned with public tool definitions', () => {
    const toolNames = (tools as ToolDefinition[]).map(tool => tool.function.name).sort()
    const metadataNames = Object.keys(embeddedToolMetadata)
      .filter(toolName => !INTERNAL_ONLY_TOOL_NAMES.includes(toolName))
      .sort()

    expect(metadataNames).toEqual(toolNames)
  })

  it('throws on duplicate tool names during merge', () => {
    expect(() =>
      mergeEmbeddedToolMetadata(
        {
          test_tool: {
            capability: 'memory',
            riskLevel: 'none',
            mutatesWorkspace: false,
            subagent: 'allow'
          }
        },
        {
          test_tool: {
            capability: 'memory',
            riskLevel: 'warning',
            mutatesWorkspace: false,
            subagent: 'deny'
          }
        }
      )
    ).toThrow('Duplicate embedded tool metadata: test_tool')
  })
})
