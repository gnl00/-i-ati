import path from 'path'
import * as fs from 'fs/promises'
import {
  SKILL_FILE,
  SKILL_NAME_REGEX,
  normalizeSkillName,
  parseSkillMetadata,
  trimToMaxLength
} from './SkillParser'
import { ensureSkillsDir, markSkillCacheDirty } from './SkillCache'
import { findSkillDirectories, isUrl } from './SkillCollector'
import { installSkillFromDirectory } from './SkillInstaller'

export type SkillImportSummary = {
  installed: SkillMetadata[]
  renamed: Array<{ from: string; to: string }>
  skipped: Array<{ path: string; reason: string }>
  failed: Array<{ path: string; error: string }>
}

const buildConflictName = (
  baseName: string,
  folderName: string,
  existing: Set<string>
): string => {
  const folderSlug = normalizeSkillName(folderName) || 'imported'
  let candidate = `${baseName}-${folderSlug}`
  candidate = trimToMaxLength(candidate, 64)
  candidate = normalizeSkillName(candidate)

  if (!candidate || candidate === baseName) {
    candidate = trimToMaxLength(`${baseName}-imported`, 64)
    candidate = normalizeSkillName(candidate)
  }

  let suffix = 2
  let unique = candidate
  while (existing.has(unique) || !SKILL_NAME_REGEX.test(unique)) {
    const suffixText = `-${suffix}`
    const maxBaseLength = 64 - suffixText.length
    const base = trimToMaxLength(candidate, maxBaseLength)
    unique = normalizeSkillName(`${base}${suffixText}`)
    suffix += 1
  }
  return unique
}

export const importSkillsFromFolder = async (
  folderPath: string,
  listSkills: () => Promise<SkillMetadata[]>
): Promise<SkillImportSummary> => {
  if (!folderPath) {
    throw new Error('folderPath is required')
  }

  const folderStat = await fs.stat(folderPath)
  if (!folderStat.isDirectory()) {
    throw new Error('folderPath must be a directory')
  }

  const root = await ensureSkillsDir()
  const installed: SkillMetadata[] = []
  const renamed: Array<{ from: string; to: string }> = []
  const skipped: Array<{ path: string; reason: string }> = []
  const failed: Array<{ path: string; error: string }> = []

  const existing = new Set<string>()
  const currentSkills = await listSkills()
  currentSkills.forEach(skill => existing.add(skill.name))
  const currentBySource = new Map<string, SkillMetadata>()
  currentSkills.forEach(skill => {
    if (skill.source && !isUrl(skill.source)) {
      currentBySource.set(path.resolve(skill.source), skill)
    }
  })

  const skillDirs = await findSkillDirectories(folderPath)
  for (const skillDir of skillDirs) {
    const skillFile = path.join(skillDir, SKILL_FILE)

    try {
      const content = await fs.readFile(skillFile, 'utf-8')
      const parsed = parseSkillMetadata(content)
      const sourcePath = path.resolve(skillDir)
      const existingBySource = currentBySource.get(sourcePath)
      let targetName = parsed.normalizedName
      let allowOverwrite = false
      if (existingBySource) {
        targetName = existingBySource.name
        allowOverwrite = true
      } else if (existing.has(targetName)) {
        const folderName = path.basename(folderPath)
        targetName = buildConflictName(targetName, folderName, existing)
        renamed.push({ from: parsed.rawName, to: targetName })
      }

      const metadata = await installSkillFromDirectory(
        skillDir,
        { source: skillDir },
        root,
        allowOverwrite,
        sourcePath,
        targetName
      )
      installed.push(metadata)
      existing.add(metadata.name)
      if (metadata.source && !isUrl(metadata.source)) {
        currentBySource.set(path.resolve(metadata.source), metadata)
      }
    } catch (error: any) {
      failed.push({ path: skillDir, error: error.message || 'Unknown error' })
    }
  }

  markSkillCacheDirty()
  return { installed, renamed, skipped, failed }
}
