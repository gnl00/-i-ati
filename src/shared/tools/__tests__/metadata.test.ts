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

  it('keeps wiki action metadata aligned with action-specific workspace policy', () => {
    const overrides = embeddedToolMetadata.wiki.actionOverrides
    const wikiMetadataNames = Object.keys(embeddedToolMetadata)
      .filter(name => name === 'wiki' || name.startsWith('wiki_'))
      .sort()

    expect(wikiMetadataNames).toEqual(['wiki'])
    expect(overrides?.list?.mutatesWorkspace).toBe(false)
    expect(overrides?.read?.mutatesWorkspace).toBe(false)
    expect(overrides?.search?.mutatesWorkspace).toBe(false)
    expect(overrides?.write).toMatchObject({ capability: 'filesystem_write', riskLevel: 'warning', mutatesWorkspace: true })
    expect(overrides?.delete).toMatchObject({ capability: 'filesystem_write', riskLevel: 'dangerous', mutatesWorkspace: true })
    expect(embeddedToolMetadata.wiki.subagent).toBe('deny')
  })

  it('keeps user_info action metadata aligned with action-specific risk policy', () => {
    const overrides = embeddedToolMetadata.user_info.actionOverrides
    const userInfoMetadataNames = Object.keys(embeddedToolMetadata)
      .filter(name => name === 'user_info' || name.startsWith('user_info_'))
      .sort()

    expect(userInfoMetadataNames).toEqual(['user_info'])
    expect(overrides?.get).toMatchObject({ capability: 'user_info', riskLevel: 'none', mutatesWorkspace: false })
    expect(overrides?.set).toMatchObject({ capability: 'user_info', riskLevel: 'warning', mutatesWorkspace: false })
    expect(embeddedToolMetadata.user_info.subagent).toBe('deny')
  })

  it('keeps soul action metadata aligned with action-specific risk policy', () => {
    const overrides = embeddedToolMetadata.soul.actionOverrides
    const soulMetadataNames = Object.keys(embeddedToolMetadata)
      .filter(name => name === 'soul' || name.startsWith('soul_'))
      .sort()

    expect(soulMetadataNames).toEqual(['soul'])
    expect(overrides?.get).toMatchObject({ capability: 'soul', riskLevel: 'none', mutatesWorkspace: false })
    expect(overrides?.edit).toMatchObject({ capability: 'soul', riskLevel: 'warning', mutatesWorkspace: false })
    expect(overrides?.reset).toMatchObject({ capability: 'soul', riskLevel: 'warning', mutatesWorkspace: false })
    expect(embeddedToolMetadata.soul.subagent).toBe('deny')
  })

  it('declares web_fetch result compaction through tool metadata', () => {
    expect(embeddedToolMetadata.web_fetch.resultCompaction).toEqual({
      enabled: true,
      level: 'balanced',
      compactorId: 'web-document',
      modelInputPolicy: 'redact-secrets'
    })
    expect(embeddedToolMetadata.web_search.resultCompaction).toBeUndefined()
  })

  it('declares exec balanced result compaction through tool metadata', () => {
    expect(embeddedToolMetadata.exec.resultCompaction).toEqual({
      enabled: true,
      level: 'balanced',
      compactorId: 'command-output',
      modelInputPolicy: 'redact-secrets'
    })
  })
})
