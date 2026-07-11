import { app } from 'electron'
import path from 'path'
import * as fs from 'fs'

export interface ProviderDefinitionLoaderDeps {
  isPackaged: () => boolean
  getAppPath: () => string
  getResourcesPath: () => string
  fileExists: (filePath: string) => boolean
  readTextFile: (filePath: string) => string
}

const defaultDeps: ProviderDefinitionLoaderDeps = {
  isPackaged: () => app.isPackaged,
  getAppPath: () => app.getAppPath(),
  getResourcesPath: () => process.resourcesPath,
  fileExists: (filePath) => fs.existsSync(filePath),
  readTextFile: (filePath) => fs.readFileSync(filePath, 'utf-8')
}

export class ProviderDefinitionLoader {
  constructor(private readonly deps: ProviderDefinitionLoaderDeps = defaultDeps) {}

  load(): ProviderDefinition[] {
    try {
      const filePath = this.deps.isPackaged()
        ? path.join(this.deps.getResourcesPath(), 'providers/providers.json')
        : path.join(this.deps.getAppPath(), 'resources/providers/providers.json')

      if (!this.deps.fileExists(filePath)) return []

      return JSON.parse(this.deps.readTextFile(filePath)) as ProviderDefinition[]
    } catch {
      return []
    }
  }
}
