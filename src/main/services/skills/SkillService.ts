import {
  listInstalledSkillMetadata,
  listSkillMetadata,
  readSkillContent,
  deleteInstalledSkill,
  ensureSkillsDir,
  markSkillCacheDirty,
  resolveSkillRootPath as resolveSkillRootPathImpl
} from './SkillCache'
import { loadSkill as installSkill, type LoadSkillArgs } from './SkillInstaller'
import {
  importSkillsFromFolder as importSkillsFromFolderImpl,
  type SkillImportSummary
} from './SkillImporter'
import { recoverSkillInstallTransactions, withSkillRootLock } from './SkillInstallation'

let skillMutationQueue: Promise<void> = Promise.resolve()

const enqueueSkillMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
  const result = skillMutationQueue.then(operation, operation)
  skillMutationQueue = result.then(() => undefined, () => undefined)
  return await result
}

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
    await enqueueSkillMutation(() => deleteInstalledSkill(name))
  }

  static async loadSkill(args: LoadSkillArgs): Promise<SkillMetadata> {
    return await enqueueSkillMutation(() => installSkill(args))
  }

  static async importSkillsFromFolder(folderPath: string): Promise<SkillImportSummary> {
    return await enqueueSkillMutation(
      () => importSkillsFromFolderImpl(folderPath, () => SkillService.listInstalledSkills())
    )
  }

  static async initializeFromConfig(config?: IAppConfig): Promise<void> {
    const folders = config?.skills?.folders || []
    try {
      await enqueueSkillMutation(async () => {
        const root = await ensureSkillsDir()
        await withSkillRootLock(root, async () => {
          await recoverSkillInstallTransactions(root)
          markSkillCacheDirty()
        })
      })
    } catch (error) {
      console.error('[SkillService] Failed to recover skill installations on startup:', error)
    }

    for (const folder of folders) {
      try {
        const summary = await SkillService.importSkillsFromFolder(folder)
        if (summary.failed.length > 0) {
          console.error(
            '[SkillService] Skill import reported failures on startup:',
            folder,
            summary.failed.map(item => `${item.path}: ${item.error}`).join('; ')
          )
        }
      } catch (error) {
        console.error(
          '[SkillService] Failed to import skills from folder on startup:',
          folder,
          error
        )
      }
    }
  }
}

export { SkillService }
