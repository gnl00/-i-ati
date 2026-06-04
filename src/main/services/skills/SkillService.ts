import {
  listInstalledSkillMetadata,
  listSkillMetadata,
  readSkillContent,
  deleteInstalledSkill,
  resolveSkillRootPath as resolveSkillRootPathImpl
} from './SkillCache'
import { loadSkill as installSkill, type LoadSkillArgs } from './SkillInstaller'
import {
  importSkillsFromFolder as importSkillsFromFolderImpl,
  type SkillImportSummary
} from './SkillImporter'

class SkillService {
  static async listSkills(): Promise<SkillMetadata[]> {
    return await listSkillMetadata()
  }

  static async listInstalledSkills(): Promise<SkillMetadata[]> {
    return await listInstalledSkillMetadata()
  }

  static async getSkillContent(name: string): Promise<string> {
    return await readSkillContent(name)
  }

  static async resolveSkillRootPath(name: string): Promise<string> {
    return await resolveSkillRootPathImpl(name)
  }

  static async deleteSkill(name: string): Promise<void> {
    await deleteInstalledSkill(name)
  }

  static async loadSkill(args: LoadSkillArgs): Promise<SkillMetadata> {
    return await installSkill(args)
  }

  static async importSkillsFromFolder(folderPath: string): Promise<SkillImportSummary> {
    return await importSkillsFromFolderImpl(folderPath, () => SkillService.listInstalledSkills())
  }

  static async initializeFromConfig(config?: IAppConfig): Promise<void> {
    const folders = config?.skills?.folders || []
    if (folders.length === 0) {
      return
    }

    const results = await Promise.allSettled(
      folders.map(folder => SkillService.importSkillsFromFolder(folder))
    )
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          '[SkillService] Failed to import skills from folder on startup:',
          folders[index],
          result.reason
        )
      }
    })
  }
}

export { SkillService }
