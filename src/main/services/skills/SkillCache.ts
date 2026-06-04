import { app } from 'electron'
import path from 'path'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import { configDb } from '@main/db/config'
import {
  SKILL_FILE,
  parseSkillMetadata,
  validateSkillName
} from './SkillParser'

type SkillMetadataCacheItem = SkillMetadata & {
  mtimeMs: number
}

type SkillMetadataCacheFile = {
  version: number
  generatedAt: number
  root: string
  items: SkillMetadataCacheItem[]
}

type SkillSourceInfo = {
  source: string
  importedAt: number
}

const SKILLS_DIR = 'skills'
const BUILT_IN_SKILL_SOURCE = 'built-in'
const SKILL_METADATA_CACHE_KEY = 'skillsMetadataCache'
const SKILL_SOURCE_FILE = '.skill-source.json'
const SKILL_METADATA_CACHE_VERSION = 1

const skillMetadataCache: {
  root: string | null
  dirty: boolean
  items: SkillMetadata[]
} = {
  root: null,
  dirty: true,
  items: []
}

const ensureCacheRoot = (root: string): void => {
  if (skillMetadataCache.root !== root) {
    skillMetadataCache.root = root
    skillMetadataCache.dirty = true
    skillMetadataCache.items = []
  }
}

export const markSkillCacheDirty = (): void => {
  skillMetadataCache.dirty = true
}

export const ensureSkillsDir = async (): Promise<string> => {
  const root = path.join(app.getPath('userData'), SKILLS_DIR)
  await fs.mkdir(root, { recursive: true })
  ensureCacheRoot(root)
  return root
}

export const resolveBuiltInSkillsDir = (): string => {
  const resourcesRoot = app.isPackaged
    ? process.resourcesPath
    : path.join(process.cwd(), 'resources')
  return path.join(resourcesRoot, SKILLS_DIR)
}

export const skillDirExists = async (dirPath: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

export const readSkillSourceInfo = async (skillDir: string): Promise<SkillSourceInfo | null> => {
  const sourceFile = path.join(skillDir, SKILL_SOURCE_FILE)
  if (!existsSync(sourceFile)) {
    return null
  }

  try {
    const raw = await fs.readFile(sourceFile, 'utf-8')
    const parsed = JSON.parse(raw) as SkillSourceInfo
    if (!parsed?.source) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export const writeSkillSourceInfo = async (
  skillDir: string,
  source?: string
): Promise<void> => {
  if (!source) {
    return
  }
  const payload: SkillSourceInfo = {
    source,
    importedAt: Date.now()
  }
  const sourceFile = path.join(skillDir, SKILL_SOURCE_FILE)
  await fs.writeFile(sourceFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

const canUseDbCache = (): boolean => {
  try {
    return configDb.isReady()
  } catch {
    return false
  }
}

const readSkillMetadata = async (
  skillDir: string,
  source?: string
): Promise<SkillMetadataCacheItem | null> => {
  const skillFile = path.join(skillDir, SKILL_FILE)
  if (!existsSync(skillFile)) {
    return null
  }

  try {
    const stat = await fs.stat(skillFile)
    const content = await fs.readFile(skillFile, 'utf-8')
    const parsed = parseSkillMetadata(content, { name: path.basename(skillDir) })
    const sourceInfo = await readSkillSourceInfo(skillDir)
    return {
      ...parsed.metadata,
      mtimeMs: stat.mtimeMs,
      source: source ?? sourceInfo?.source
    }
  } catch (error) {
    console.warn(`[SkillService] Failed to parse skill in ${path.basename(skillDir)}:`, error)
    return null
  }
}

const readMetadataCacheFile = async (root: string): Promise<SkillMetadataCacheFile | null> => {
  if (!canUseDbCache()) {
    return null
  }
  try {
    const raw = configDb.getConfigValue(SKILL_METADATA_CACHE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as SkillMetadataCacheFile
    if (!parsed || parsed.version !== SKILL_METADATA_CACHE_VERSION || parsed.root !== root) {
      return null
    }
    if (!Array.isArray(parsed.items)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

const writeMetadataCacheFile = async (
  root: string,
  items: SkillMetadataCacheItem[]
): Promise<void> => {
  if (!canUseDbCache()) {
    return
  }
  const payload: SkillMetadataCacheFile = {
    version: SKILL_METADATA_CACHE_VERSION,
    generatedAt: Date.now(),
    root,
    items
  }
  configDb.saveConfigValue(
    SKILL_METADATA_CACHE_KEY,
    JSON.stringify(payload),
    SKILL_METADATA_CACHE_VERSION
  )
}

const isCacheValid = async (root: string, cache: SkillMetadataCacheFile): Promise<boolean> => {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const cachedByName = new Map(cache.items.map(item => [item.name, item]))
  const seen = new Set<string>()

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const skillDir = path.join(root, entry.name)
    const skillFile = path.join(skillDir, SKILL_FILE)
    if (!existsSync(skillFile)) {
      continue
    }

    const cached = cachedByName.get(entry.name)
    if (!cached) {
      return false
    }

    const stat = await fs.stat(skillFile)
    if (Math.round(stat.mtimeMs) !== Math.round(cached.mtimeMs)) {
      return false
    }
    seen.add(entry.name)
  }

  return seen.size === cachedByName.size
}

export const listInstalledSkillMetadata = async (): Promise<SkillMetadata[]> => {
  const root = await ensureSkillsDir()
  const cached = await readMetadataCacheFile(root)
  if (cached && await isCacheValid(root, cached)) {
    return cached.items.map(({ mtimeMs: _mtimeMs, ...rest }) => rest)
  }

  const entries = await fs.readdir(root, { withFileTypes: true })
  const results: SkillMetadataCacheItem[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const skillDir = path.join(root, entry.name)
    const metadata = await readSkillMetadata(skillDir)
    if (metadata) {
      results.push(metadata)
    }
  }

  const sorted = results.sort((a, b) => a.name.localeCompare(b.name))
  await writeMetadataCacheFile(root, sorted)
  return sorted.map(({ mtimeMs: _mtimeMs, ...rest }) => rest)
}

const listBuiltInSkillMetadata = async (): Promise<SkillMetadata[]> => {
  const root = resolveBuiltInSkillsDir()
  if (!existsSync(root)) {
    return []
  }

  const entries = await fs.readdir(root, { withFileTypes: true })
  const results: SkillMetadataCacheItem[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const skillDir = path.join(root, entry.name)
    const metadata = await readSkillMetadata(skillDir, BUILT_IN_SKILL_SOURCE)
    if (metadata) {
      results.push(metadata)
    }
  }

  const sorted = results.sort((a, b) => a.name.localeCompare(b.name))
  return sorted.map(({ mtimeMs: _mtimeMs, ...rest }) => rest)
}

const mergeSkillMetadata = (
  builtInSkills: SkillMetadata[],
  installedSkills: SkillMetadata[]
): SkillMetadata[] => {
  const byName = new Map<string, SkillMetadata>()
  builtInSkills.forEach(skill => byName.set(skill.name, skill))
  installedSkills.forEach(skill => byName.set(skill.name, skill))
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export const listSkillMetadata = async (): Promise<SkillMetadata[]> => {
  await ensureSkillsDir()
  if (!skillMetadataCache.dirty) {
    return [...skillMetadataCache.items]
  }

  const [installedSkills, builtInSkills] = await Promise.all([
    listInstalledSkillMetadata(),
    listBuiltInSkillMetadata()
  ])
  const items = mergeSkillMetadata(builtInSkills, installedSkills)
  skillMetadataCache.items = items
  skillMetadataCache.dirty = false
  return [...items]
}

export const resolveSkillRootPath = async (name: string): Promise<string> => {
  validateSkillName(name)
  const installedRoot = await ensureSkillsDir()
  const installedSkillRoot = path.join(installedRoot, name)
  if (existsSync(path.join(installedSkillRoot, SKILL_FILE))) {
    return installedSkillRoot
  }

  const builtInSkillRoot = path.join(resolveBuiltInSkillsDir(), name)
  if (existsSync(path.join(builtInSkillRoot, SKILL_FILE))) {
    return builtInSkillRoot
  }

  throw new Error(`Skill "${name}" not found`)
}

export const readSkillContent = async (name: string): Promise<string> => {
  const skillRoot = await resolveSkillRootPath(name)
  const skillFile = path.join(skillRoot, SKILL_FILE)
  return await fs.readFile(skillFile, 'utf-8')
}

export const deleteInstalledSkill = async (name: string): Promise<void> => {
  validateSkillName(name)
  const root = await ensureSkillsDir()
  const skillDir = path.join(root, name)
  if (!(await skillDirExists(skillDir))) {
    throw new Error(`Skill "${name}" not found`)
  }
  await fs.rm(skillDir, { recursive: true, force: true })
  markSkillCacheDirty()
}
