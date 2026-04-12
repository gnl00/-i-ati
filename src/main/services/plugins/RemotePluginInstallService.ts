import { net } from 'electron'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import extractZip from 'extract-zip'
import { createLogger } from '@main/logging/LogService'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import { LocalPluginInstallService } from './LocalPluginInstallService'
import { RemotePluginRegistryService } from './RemotePluginRegistryService'

type FetchLike = typeof fetch

export class RemotePluginInstallService {
  private readonly logger = createLogger('RemotePluginInstallService')
  private readonly effectiveFetch: FetchLike

  constructor(
    private readonly registryService: RemotePluginRegistryService,
    private readonly localInstallService: LocalPluginInstallService,
    fetchImpl?: FetchLike
  ) {
    this.effectiveFetch = fetchImpl ?? this.resolveDefaultFetch()
  }

  async install(pluginId: string): Promise<{
    plugin: RemotePluginCatalogItem
    installRoot: string
  }> {
    const registry = await this.registryService.listAvailablePlugins()
    const plugin = registry.find(item => item.pluginId === pluginId)
    if (!plugin) {
      throw new Error(`Remote plugin not found: ${pluginId}`)
    }

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'remote-plugin-install-'))
    const archivePath = path.join(tempRoot, `${plugin.pluginId}.zip`)
    const extractedRoot = path.join(tempRoot, 'archive')

    try {
      this.logger.info('install.start', { pluginId: plugin.pluginId, repo: plugin.repo, ref: plugin.ref })
      await this.downloadPluginArchive(plugin, archivePath)
      await extractZip(archivePath, { dir: extractedRoot })
      const stagedPluginDir = await this.resolveExtractedPluginDir(extractedRoot, plugin.path)
      const installRoot = await this.localInstallService.importFromDirectory(stagedPluginDir)
      this.logger.info('install.completed', { pluginId: plugin.pluginId, installRoot })
      return { plugin, installRoot }
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  }

  private async downloadPluginArchive(plugin: RemotePluginCatalogItem, archivePath: string): Promise<void> {
    const archiveUrl = `https://github.com/${plugin.repo}/archive/${encodeURIComponent(plugin.ref)}.zip`
    const response = await this.effectiveFetch(archiveUrl, {
      headers: {
        'User-Agent': 'atiapp'
      }
    })
    if (!response.ok) {
      throw new Error(`Failed to download remote plugin archive: ${response.status} ${response.statusText}`)
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer())
    await fs.writeFile(archivePath, fileBuffer)
  }

  private async resolveExtractedPluginDir(extractedRoot: string, pluginPath: string): Promise<string> {
    const directMatch = path.join(extractedRoot, pluginPath)
    if (await this.pathExists(directMatch)) {
      return directMatch
    }

    const topLevelEntries = await fs.readdir(extractedRoot, { withFileTypes: true })
    for (const entry of topLevelEntries) {
      if (!entry.isDirectory()) {
        continue
      }

      const candidate = path.join(extractedRoot, entry.name, pluginPath)
      if (await this.pathExists(candidate)) {
        return candidate
      }
    }

    throw new Error(`Failed to locate plugin directory in downloaded archive: ${pluginPath}`)
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath)
      return true
    } catch {
      return false
    }
  }

  private resolveDefaultFetch(): FetchLike {
    if (typeof net?.fetch === 'function') {
      return net.fetch.bind(net) as FetchLike
    }
    return fetch
  }
}
