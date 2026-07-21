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
