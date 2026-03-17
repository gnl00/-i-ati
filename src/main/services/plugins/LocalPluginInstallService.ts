import fs from 'fs/promises'
import path from 'path'
import { LocalPluginCatalogService } from './LocalPluginCatalogService'

export class LocalPluginInstallService {
  constructor(private readonly catalogService: LocalPluginCatalogService) {}

  async importFromDirectory(sourceDir: string): Promise<string> {
    const manifest = await this.catalogService.loadPluginManifestFromDirectory(sourceDir)
    if (manifest.status !== 'installed') {
      throw new Error(manifest.lastError ?? 'Plugin manifest validation failed')
    }

    const pluginRoot = this.catalogService.getPluginRoot()
    const destinationDir = path.join(pluginRoot, manifest.pluginId)
    const resolvedSourceDir = path.resolve(sourceDir)
    const resolvedDestinationDir = path.resolve(destinationDir)

    if (resolvedSourceDir === resolvedDestinationDir) {
      return resolvedDestinationDir
    }

    await fs.mkdir(pluginRoot, { recursive: true })
    await fs.rm(destinationDir, { recursive: true, force: true })
    await fs.cp(resolvedSourceDir, destinationDir, { recursive: true })

    return resolvedDestinationDir
  }

  async uninstall(pluginId: string): Promise<void> {
    const normalizedPluginId = pluginId.trim()
    if (!normalizedPluginId) {
      throw new Error('Plugin id is required')
    }

    const pluginRoot = this.catalogService.getPluginRoot()
    const destinationDir = path.join(pluginRoot, normalizedPluginId)
    await fs.rm(destinationDir, { recursive: true, force: true })
  }
}
