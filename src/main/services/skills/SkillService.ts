import { app } from 'electron'
import path from 'path'
import * as fs from 'fs/promises'
import { configDb } from '@main/db/config'
import { scanSkillSources } from './SkillCollector'
import { SKILL_FILE, validateSkillName } from './SkillParser'
import { resolveSkillPath } from './SkillPathResolver'

class SkillService {
  private static catalog: SkillScanResult = { skills: [], issues: [] }
  private static pending: Promise<SkillScanResult> | undefined
  private static scanQueue: Promise<void> = Promise.resolve()

  static initializeFromConfig(config?: IAppConfig): Promise<SkillScanResult> {
    const folders = [...(config?.skills?.folders ?? [])]
    const builtInRoot = path.join(
      app.isPackaged
        ? process.resourcesPath
        : path.join(process.cwd(), 'resources'),
      'skills'
    )
    const pending = this.scanQueue.then(async () => {
      const result = await scanSkillSources(folders, builtInRoot)
      this.catalog = result
      return result
    })
    this.scanQueue = pending.then(
      () => undefined,
      () => undefined
    )
    this.pending = pending
    return pending
  }

  static async refresh(): Promise<SkillScanResult> {
    await this.initializeFromConfig(configDb.getConfig())
    return await this.getScanResult()
  }

  static async listSkills(): Promise<SkillMetadata[]> {
    const result = await this.getScanResult()
    return result.skills.filter(skill => skill.enabled !== false)
  }

  static async getScanResult(): Promise<SkillScanResult> {
    await (this.pending ?? this.refresh())
    const disabledNames = new Set(configDb.getConfig()?.skills?.disabledNames ?? [])
    return {
      skills: this.catalog.skills.map(skill => ({ ...skill, enabled: !disabledNames.has(skill.name) })),
      issues: [...this.catalog.issues]
    }
  }

  static async resolveSkillRootPath(name: string, options: { allowDisabled?: boolean } = {}): Promise<string> {
    validateSkillName(name)
    const { skills } = await this.getScanResult()
    const skill = skills.find(item => item.name === name)
    if (skill?.enabled === false && !options.allowDisabled) {
      throw new Error(`Skill "${name}" is disabled. Enable it in Settings > Skills.`)
    }
    if (!skill?.path)
      throw new Error(
        `Skill "${name}" is not available in configured source folders or embedded skills. Refresh sources to discover changes.`
      )
    const root = path.dirname(skill.path)
    await resolveSkillPath(root, SKILL_FILE, 'Skill file')
    return root
  }

  static async getSkillContent(name: string): Promise<string> {
    const root = await this.resolveSkillRootPath(name)
    const resolved = await resolveSkillPath(root, SKILL_FILE, 'Skill file')
    return await fs.readFile(resolved.canonicalPath, 'utf-8')
  }
}

export { SkillService }
