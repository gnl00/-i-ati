import { net } from 'electron'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { createLogger } from '@main/services/logging/LogService'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import { LocalPluginInstallService } from './LocalPluginInstallService'
import { RemotePluginRegistryService } from './RemotePluginRegistryService'

type FetchLike = typeof fetch

type GitHubContentNode = {
  type: 'file' | 'dir'
  path: string
  download_url?: string | null
}

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
    const stagedPluginDir = path.join(tempRoot, plugin.pluginId)

    try {
      this.logger.info('install.start', { pluginId: plugin.pluginId, repo: plugin.repo, ref: plugin.ref })
      await this.downloadPluginDirectory(plugin, stagedPluginDir)
      const installRoot = await this.localInstallService.importFromDirectory(stagedPluginDir)
      this.logger.info('install.completed', { pluginId: plugin.pluginId, installRoot })
      return { plugin, installRoot }
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  }

  private async downloadPluginDirectory(plugin: RemotePluginCatalogItem, destinationRoot: string): Promise<void> {
    await fs.mkdir(destinationRoot, { recursive: true })
    await this.downloadDirectoryRecursive(plugin.repo, plugin.ref, plugin.path, plugin.path, destinationRoot)
  }

  private async downloadDirectoryRecursive(
    repo: string,
    ref: string,
    remotePath: string,
    basePluginPath: string,
    destinationRoot: string
  ): Promise<void> {
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${remotePath}?ref=${encodeURIComponent(ref)}`
    const response = await this.effectiveFetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'atiapp'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to list remote plugin files: ${response.status} ${response.statusText}`)
    }

    const payload = await response.json() as unknown
    if (!Array.isArray(payload)) {
      throw new Error(`Unexpected GitHub contents response for ${remotePath}`)
    }

    for (const item of payload) {
      const node = item as GitHubContentNode
      if (node.type === 'dir') {
        await this.downloadDirectoryRecursive(repo, ref, node.path, basePluginPath, destinationRoot)
        continue
      }

      if (node.type !== 'file' || !node.download_url) {
        continue
      }

      const relativePath = this.toSafeRelativePath(node.path, basePluginPath)
      const outputPath = path.join(destinationRoot, relativePath)
      await fs.mkdir(path.dirname(outputPath), { recursive: true })

      const fileResponse = await this.effectiveFetch(node.download_url, {
        headers: {
          'User-Agent': 'atiapp'
        }
      })
      if (!fileResponse.ok) {
        throw new Error(`Failed to download remote plugin file: ${node.path}`)
      }

      const fileBuffer = Buffer.from(await fileResponse.arrayBuffer())
      await fs.writeFile(outputPath, fileBuffer)
    }
  }

  private toSafeRelativePath(fullPath: string, basePluginPath: string): string {
    if (!fullPath.startsWith(`${basePluginPath}/`)) {
      throw new Error(`Remote plugin file escaped plugin root: ${fullPath}`)
    }

    const relativePath = fullPath.slice(basePluginPath.length + 1)
    const normalized = path.normalize(relativePath)
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error(`Remote plugin file resolved outside destination root: ${fullPath}`)
    }

    return normalized
  }

  private resolveDefaultFetch(): FetchLike {
    if (typeof net?.fetch === 'function') {
      return net.fetch.bind(net) as FetchLike
    }
    return fetch
  }
}
