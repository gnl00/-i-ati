import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  overlayReadyToolResultCompactions,
  resolvePersistedToolResultMessages,
  selectConfiguredReadyToolResultCompactions
} from '../ToolResultCompactionOverlay'
import type {
  ReadyToolResultCompaction,
  ToolResultCompactionMetadataLookup
} from '../ToolResultCompactionOverlay'

const compaction = (
  overrides: Partial<ReadyToolResultCompaction> = {}
): ReadyToolResultCompaction => ({
  messageId: 42,
  toolName: 'web_fetch',
  toolCallId: 'call-42',
  content: 'compact result',
  level: 'balanced',
  compactorId: 'web-document',
  compactorVersion: 1,
  originalHash: createHash('sha256').update('raw result').digest('hex'),
  updatedAt: 10,
  ...overrides
})

const metadataLookup: ToolResultCompactionMetadataLookup = {
  getToolMetadata: () => ({
    resultCompaction: {
      enabled: true,
      level: 'balanced',
      compactorId: 'web-document'
    }
  })
}

describe('ToolResultCompactionOverlay', () => {
  it('selects ready content that matches the current tool metadata', () => {
    const selected = selectConfiguredReadyToolResultCompactions([
      compaction(),
      compaction({ messageId: 43, level: 'minimal' }),
      compaction({ messageId: 44, compactorId: 'legacy' })
    ], metadataLookup)

    expect(selected).toEqual([compaction()])
  })

  it('clones the selected tool entity and preserves the raw input entity', () => {
    const rawMessage: MessageEntity = {
      id: 42,
      chatId: 7,
      body: {
        role: 'tool',
        name: 'web_fetch',
        toolCallId: 'call-42',
        content: 'raw result',
        segments: []
      }
    }

    const [resolvedMessage] = overlayReadyToolResultCompactions(
      [rawMessage],
      [compaction()]
    )

    expect(resolvedMessage).toEqual({
      ...rawMessage,
      body: {
        ...rawMessage.body,
        content: 'compact result'
      }
    })
    expect(resolvedMessage).not.toBe(rawMessage)
    expect(resolvedMessage.body).not.toBe(rawMessage.body)
    expect(rawMessage.body.content).toBe('raw result')
  })

  it('selects the newest compactor version for each persisted message', () => {
    const rawMessage: MessageEntity = {
      id: 42,
      body: {
        role: 'tool',
        content: 'raw result',
        segments: []
      }
    }

    const [resolvedMessage] = overlayReadyToolResultCompactions([rawMessage], [
      compaction({ content: 'version 1', compactorVersion: 1, updatedAt: 30 }),
      compaction({ content: 'version 2', compactorVersion: 2, updatedAt: 20 })
    ])

    expect(resolvedMessage.body.content).toBe('version 2')
  })

  it('reuses entities without selected compact content', () => {
    const userMessage: MessageEntity = {
      id: 41,
      body: {
        role: 'user',
        content: 'question',
        segments: []
      }
    }
    const toolMessage: MessageEntity = {
      id: 42,
      body: {
        role: 'tool',
        content: 'raw result',
        segments: []
      }
    }

    const resolved = overlayReadyToolResultCompactions(
      [userMessage, toolMessage],
      [compaction({ messageId: 99 })]
    )

    expect(resolved[0]).toBe(userMessage)
    expect(resolved[1]).toBe(toolMessage)
  })

  it('keeps raw content when the ready compaction belongs to an older raw value', () => {
    const rawMessage: MessageEntity = {
      id: 42,
      body: {
        role: 'tool',
        name: 'web_fetch',
        content: 'updated raw result',
        segments: []
      }
    }

    const [resolvedMessage] = overlayReadyToolResultCompactions(
      [rawMessage],
      [compaction()]
    )

    expect(resolvedMessage).toBe(rawMessage)
    expect(resolvedMessage.body.content).toBe('updated raw result')
  })

  it('loads ready compactions for persisted tool messages and overlays configured content', () => {
    const rawMessage: MessageEntity = {
      id: 42,
      body: {
        role: 'tool',
        name: 'web_fetch',
        content: 'raw result',
        segments: []
      }
    }
    const lookup = {
      getReadyToolResultCompactionsByMessageIds: vi.fn(() => [compaction()])
    }

    const resolved = resolvePersistedToolResultMessages(
      [rawMessage],
      lookup,
      metadataLookup
    )

    expect(lookup.getReadyToolResultCompactionsByMessageIds).toHaveBeenCalledWith([42])
    expect(resolved[0].body.content).toBe('compact result')
    expect(rawMessage.body.content).toBe('raw result')
  })
})
