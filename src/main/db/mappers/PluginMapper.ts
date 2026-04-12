import { builtInPluginRegistry } from '@shared/plugins/builtInRegistry'
import type { AppPluginSource } from '@shared/plugins/types'
import type { PluginCapabilityRow } from '@main/db/dao/PluginCapabilityDao'
import type { PluginRow } from '@main/db/dao/PluginDao'
import type { PluginSettingRow } from '@main/db/dao/PluginSettingDao'
import type { ScannedLocalPluginManifest } from '@main/services/plugins'

export const toAppPluginConfig = (row: PluginRow): AppPluginConfig => ({
  id: row.plugin_id,
  name: row.display_name,
  description: row.description ?? undefined,
  enabled: row.enabled === 1,
  source: row.source,
  version: row.version ?? undefined,
  manifestPath: row.manifest_path ?? undefined
})

export const toPluginEntity = (
  row: PluginRow,
  capabilityRows: PluginCapabilityRow[]
): PluginEntity => ({
  pluginId: row.plugin_id,
  name: row.display_name,
  description: row.description ?? undefined,
  source: row.source,
  enabled: row.enabled === 1,
  version: row.version ?? undefined,
  manifestPath: row.manifest_path ?? undefined,
  installRoot: row.install_root ?? undefined,
  status: row.status,
  lastError: row.last_error ?? undefined,
  capabilities: capabilityRows.map(capability => ({
    kind: capability.capability_kind,
    data: parsePluginCapabilityJson(capability.capability_json)
  }))
})

export const toPluginRowFromConfig = (
  config: AppPluginConfig,
  now: number,
  existing?: PluginRow
): PluginRow => {
  const builtInDefinition = builtInPluginRegistry.getById(config.id)

  return {
    plugin_id: config.id,
    source: builtInDefinition ? 'built-in' : (config.source ?? existing?.source ?? 'local'),
    display_name: builtInDefinition?.name ?? config.name,
    description: builtInDefinition?.description ?? config.description ?? null,
    enabled: config.enabled === false ? 0 : 1,
    version: config.version ?? existing?.version ?? null,
    manifest_path: config.manifestPath ?? existing?.manifest_path ?? null,
    install_root: existing?.install_root ?? null,
    status: existing?.status ?? 'installed',
    last_error: existing?.last_error ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now
  }
}

export const toPluginRowFromManifest = (
  manifest: ScannedLocalPluginManifest,
  now: number,
  existing?: PluginRow
): PluginRow => ({
  plugin_id: manifest.pluginId,
  source: existing?.source === 'remote' ? 'remote' : 'local',
  display_name: manifest.displayName,
  description: manifest.description ?? null,
  enabled: existing?.enabled ?? 1,
  version: manifest.version ?? null,
  manifest_path: manifest.manifestPath,
  install_root: manifest.installRoot,
  status: manifest.status,
  last_error: manifest.lastError ?? null,
  created_at: existing?.created_at ?? now,
  updated_at: now
})

export const toPluginCapabilityRows = (
  pluginId: string,
  capabilities: PluginEntity['capabilities'],
  now: number
): PluginCapabilityRow[] =>
  capabilities.map(capability => ({
    plugin_id: pluginId,
    capability_kind: capability.kind,
    capability_json: JSON.stringify(capability),
    created_at: now,
    updated_at: now
  }))

export const toPluginSettingRow = (
  pluginId: string,
  key: string,
  value: unknown,
  updatedAt: number
): PluginSettingRow => ({
  plugin_id: pluginId,
  key,
  value_json: JSON.stringify(value),
  updated_at: updatedAt
})

export const toPluginRowWithUpdatedSource = (
  row: PluginRow,
  source: AppPluginSource,
  updatedAt: number
): PluginRow => ({
  ...row,
  source,
  updated_at: updatedAt
})

const parsePluginCapabilityJson = (value: string): Record<string, unknown> | undefined => {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return undefined
  }
}
