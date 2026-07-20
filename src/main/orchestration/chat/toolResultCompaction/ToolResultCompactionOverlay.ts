import { createHash } from 'node:crypto'
import type { ToolResultCompaction } from '@main/db/mappers/ToolResultCompactionMapper'
import { embeddedToolsRegistry } from '@tools/registry'

export type ReadyToolResultCompaction = Pick<
  ToolResultCompaction,
  | 'messageId'
  | 'toolName'
  | 'toolCallId'
  | 'content'
  | 'level'
  | 'originalHash'
  | 'compactorId'
  | 'compactorVersion'
  | 'updatedAt'
>

export interface ToolResultCompactionMetadataLookup {
  getToolMetadata(toolName: string): {
    resultCompaction?: {
      enabled: boolean
      level: ReadyToolResultCompaction['level']
      compactorId: string
    }
  } | undefined
}

export interface ReadyToolResultCompactionLookup {
  getReadyToolResultCompactionsByMessageIds(messageIds: number[]): ReadyToolResultCompaction[]
}

export function matchesToolResultCompactionOriginalContent(
  compaction: Pick<ReadyToolResultCompaction, 'originalHash'>,
  rawContent: unknown
): boolean {
  return typeof rawContent === 'string'
    && createHash('sha256').update(rawContent).digest('hex') === compaction.originalHash
}

export function selectConfiguredReadyToolResultCompactions(
  compactions: ReadyToolResultCompaction[],
  metadataLookup: ToolResultCompactionMetadataLookup = embeddedToolsRegistry
): ReadyToolResultCompaction[] {
  return compactions.filter((compaction) => {
    const metadata = metadataLookup.getToolMetadata(compaction.toolName)?.resultCompaction
    return Boolean(
      compaction.content
      && metadata?.enabled
      && metadata.level === compaction.level
      && metadata.compactorId === compaction.compactorId
    )
  })
}

export function selectPreferredReadyToolResultCompactions(
  compactions: ReadyToolResultCompaction[],
  keyOf: (compaction: ReadyToolResultCompaction) => string | number | undefined
): Map<string | number, ReadyToolResultCompaction> {
  const selected = new Map<string | number, ReadyToolResultCompaction>()

  compactions.forEach((compaction) => {
    const key = keyOf(compaction)
    if (key == null || !compaction.content) {
      return
    }

    const current = selected.get(key)
    if (
      !current
      || compaction.compactorVersion > current.compactorVersion
      || (
        compaction.compactorVersion === current.compactorVersion
        && compaction.updatedAt > current.updatedAt
      )
    ) {
      selected.set(key, compaction)
    }
  })

  return selected
}

export function overlayReadyToolResultCompactions(
  messages: MessageEntity[],
  readyCompactions: ReadyToolResultCompaction[]
): MessageEntity[] {
  const rawContentByMessageId = new Map<number, unknown>()
  messages.forEach((message) => {
    if (message.id != null && message.body.role === 'tool') {
      rawContentByMessageId.set(message.id, message.body.content)
    }
  })
  const compactionByMessageId = selectPreferredReadyToolResultCompactions(
    readyCompactions.filter(compaction =>
      matchesToolResultCompactionOriginalContent(
        compaction,
        rawContentByMessageId.get(compaction.messageId)
      )
    ),
    compaction => compaction.messageId
  )

  return messages.map((message) => {
    if (message.id == null || message.body.role !== 'tool') {
      return message
    }

    const content = compactionByMessageId.get(message.id)?.content
    if (!content || content === message.body.content) {
      return message
    }

    return {
      ...message,
      body: {
        ...message.body,
        content
      }
    }
  })
}

export function resolvePersistedToolResultMessages(
  messages: MessageEntity[],
  lookup: ReadyToolResultCompactionLookup,
  metadataLookup: ToolResultCompactionMetadataLookup = embeddedToolsRegistry
): MessageEntity[] {
  const messageIds = messages
    .filter((message) => message.id != null && message.body.role === 'tool')
    .map((message) => message.id as number)

  if (messageIds.length === 0) {
    return messages
  }

  const configuredCompactions = selectConfiguredReadyToolResultCompactions(
    lookup.getReadyToolResultCompactionsByMessageIds(messageIds),
    metadataLookup
  )
  return overlayReadyToolResultCompactions(messages, configuredCompactions)
}
