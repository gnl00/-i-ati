import type { EmbeddedToolMetadataMap } from './metadata-types'

export function mergeEmbeddedToolMetadata(...groups: EmbeddedToolMetadataMap[]): EmbeddedToolMetadataMap {
  const merged: EmbeddedToolMetadataMap = {}

  groups.forEach(group => {
    Object.entries(group).forEach(([toolName, metadata]) => {
      if (merged[toolName]) {
        throw new Error(`Duplicate embedded tool metadata: ${toolName}`)
      }
      merged[toolName] = metadata
    })
  })

  return merged
}
