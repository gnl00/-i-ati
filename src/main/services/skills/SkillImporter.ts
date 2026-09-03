import path from 'path'
import * as fs from 'fs/promises'
import {
  SKILL_FILE,
  SKILL_NAME_REGEX,
  normalizeSkillName,
  parseSkillMetadata,
  trimToMaxLength
} from './SkillParser'
import {
  ensureSkillsDir,
  listInstalledSkillStates,
  markSkillCacheDirty,
  type InstalledSkillInspection
} from './SkillCache'
import { recoverSkillInstallTransactions, withSkillRootLock } from './SkillInstallation'
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

const sourceMatches = (source: string | undefined, candidate: string): boolean => {
  if (!source || isUrl(source)) {
    return !source
  }
  return path.resolve(source) === path.resolve(candidate)
}

const importSkillsFromFolderUnlocked = async (
  folderPath: string,
  listSkills: () => Promise<SkillMetadata[]>,
  root: string
): Promise<SkillImportSummary> => {
  await recoverSkillInstallTransactions(root)
  markSkillCacheDirty()
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

  const installedStates = await listInstalledSkillStates(root)
  const incompleteByName = new Map<string, InstalledSkillInspection>()
  const protectedByName = new Map<string, InstalledSkillInspection>()
  for (const state of installedStates) {
    existing.add(state.name)
    if (state.state === 'incomplete') {
      incompleteByName.set(state.name, state)
    } else if (state.state === 'unsafe' || state.state === 'unreadable') {
      protectedByName.set(state.name, state)
    }
  }

  const skillDirs = await findSkillDirectories(folderPath)
  for (const skillDir of skillDirs) {
    const skillFile = path.join(skillDir, SKILL_FILE)

    try {
      const content = await fs.readFile(skillFile, 'utf-8')
      const parsed = parseSkillMetadata(content)
      const sourcePath = path.resolve(skillDir)
      const existingBySource = currentBySource.get(sourcePath)
      const incomplete = incompleteByName.get(parsed.normalizedName)
      const protectedState = protectedByName.get(parsed.normalizedName)
      let targetName = parsed.normalizedName
      let allowOverwrite = false
      let preserveBackup = false

      if (existingBySource) {
        targetName = existingBySource.name
        allowOverwrite = true
      } else if (protectedState) {
        throw new Error(
          `Existing skill "${parsed.normalizedName}" cannot be safely inspected: `
          + `${protectedState.error || protectedState.state}`
        )
      } else if (
        incomplete
        && sourceMatches(incomplete.source, sourcePath)
      ) {
        targetName = parsed.normalizedName
        allowOverwrite = true
        preserveBackup = true
      } else if (existing.has(targetName)) {
        const folderName = path.basename(folderPath)
        targetName = buildConflictName(targetName, folderName, existing)
        renamed.push({ from: parsed.rawName, to: targetName })
      }

      const metadata = preserveBackup
        ? await installSkillFromDirectory(
          skillDir,
          { source: skillDir },
          root,
          allowOverwrite,
          sourcePath,
          targetName,
          { preserveBackup: true }
        )
        : await installSkillFromDirectory(
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
      incompleteByName.delete(parsed.normalizedName)
      protectedByName.delete(parsed.normalizedName)
    } catch (error: any) {
      failed.push({ path: skillDir, error: error.message || 'Unknown error' })
    }
  }

  markSkillCacheDirty()
  return { installed, renamed, skipped, failed }
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
  return await withSkillRootLock(root, async () => {
    return await importSkillsFromFolderUnlocked(folderPath, listSkills, root)
  })
}
