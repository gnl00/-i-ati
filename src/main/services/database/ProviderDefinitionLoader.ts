import { app } from 'electron'
import path from 'path'
import * as fs from 'fs'

export class ProviderDefinitionLoader {
  load(): ProviderDefinition[] {
    try {
      const projectRoot = app.getAppPath()
      const possiblePaths = [
        path.join(projectRoot, 'src/data/providers.json'),
        path.join(projectRoot, '../src/data/providers.json'),
        path.join(process.resourcesPath, 'app.asar.unpacked/data/providers.json'),
        path.join(process.resourcesPath, 'app/data/providers.json'),
        path.join(process.resourcesPath, 'data/providers.json')
      ]

      for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
          return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ProviderDefinition[]
        }
      }

      return []
    } catch {
      return []
    }
  }
}
