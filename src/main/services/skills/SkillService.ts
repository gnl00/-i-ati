import { app } from 'electron'
import path from 'path'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import os from 'os'
import { promisify } from 'util'
import DatabaseService from '@main/services/DatabaseService'

type SkillFrontmatter = {
  name: string
  description: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  allowedTools?: string[]
}

type ParsedSkill = {
  frontmatter: SkillFrontmatter
  body: string
}

type LoadSkillArgs = {
  source: string
  name?: string
  allowOverwrite?: boolean
}

type SkillImportSummary = {
  installed: SkillMetadata[]
  renamed: Array<{ from: string; to: string }>
  skipped: Array<{ path: string; reason: string }>
  failed: Array<{ path: string; error: string }>
}

const SKILL_FILE = 'SKILL.md'
const SKILLS_DIR = 'skills'
const SKILL_METADATA_CACHE_KEY = 'skillsMetadataCache'
const SKILL_SOURCE_FILE = '.skill-source.json'
const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const execFileAsync = promisify(execFile)
const skillMetadataCache: {
  root: string | null
  dirty: boolean
  items: SkillMetadata[]
} = {
  root: null,
  dirty: true,
  items: []
}
const SKILL_METADATA_CACHE_VERSION = 1

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

const isUrl = (value: string): boolean => /^https?:\/\//i.test(value)

type ArchiveType = 'zip' | 'tar' | 'targz'

const getArchiveType = (source: string): ArchiveType | null => {
  const pathname = isUrl(source) ? new URL(source).pathname : source
  const lower = pathname.toLowerCase()
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'targz'
  if (lower.endsWith('.tar')) return 'tar'
  if (lower.endsWith('.zip')) return 'zip'
  return null
}

const normalizeSkillName = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized
}

const trimToMaxLength = (value: string, max: number): string => {
  if (value.length <= max) return value
  return value.slice(0, max).replace(/-+$/g, '')
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

const parseScalar = (value: string): string => {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const quote = trimmed[0]
    if ((quote === '"' || quote === '\'') && trimmed[trimmed.length - 1] === quote) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

const parseFrontmatter = (content: string): ParsedSkill => {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('SKILL.md must start with YAML frontmatter')
  }

  const frontmatterRaw = match[1]
  const body = match[2] ?? ''
  const lines = frontmatterRaw.split(/\r?\n/)

  const frontmatter: Partial<SkillFrontmatter> = {}
  const metadata: Record<string, string> = {}
  let inMetadata = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.trim()) {
      continue
    }

    if (inMetadata) {
      if (/^\s+/.test(line)) {
        const idx = line.indexOf(':')
        if (idx !== -1) {
          const key = line.slice(0, idx).trim()
          const value = parseScalar(line.slice(idx + 1))
          if (key) {
            metadata[key] = value
          }
        }
        continue
      }
      inMetadata = false
    }

    const keyEnd = line.indexOf(':')
    if (keyEnd === -1) {
      continue
    }
    const key = line.slice(0, keyEnd).trim()
    const value = line.slice(keyEnd + 1).trim()

    if (key === 'metadata') {
      inMetadata = true
      continue
    }

    if (key === 'allowed-tools') {
      const parsed = parseScalar(value)
      frontmatter.allowedTools = parsed ? parsed.split(/\s+/).filter(Boolean) : []
      continue
    }

    if (key === 'name') {
      frontmatter.name = parseScalar(value)
      continue
    }

    if (key === 'description') {
      frontmatter.description = parseScalar(value)
      continue
    }

    if (key === 'license') {
      frontmatter.license = parseScalar(value)
      continue
    }

    if (key === 'compatibility') {
      frontmatter.compatibility = parseScalar(value)
      continue
    }
  }

  if (Object.keys(metadata).length > 0) {
    frontmatter.metadata = metadata
  }

  if (!frontmatter.name || !frontmatter.description) {
    throw new Error('SKILL.md frontmatter must include name and description')
  }

  return {
    frontmatter: frontmatter as SkillFrontmatter,
    body
  }
}

const validateSkillName = (name: string): void => {
  if (!name || name.length > 64 || !SKILL_NAME_REGEX.test(name)) {
    throw new Error(`Invalid skill name: "${name}"`)
  }
}

const validateSkillDescription = (description: string): void => {
  if (!description || description.length > 1024) {
    throw new Error('Skill description must be 1-1024 characters')
  }
}

const validateOptionalLength = (value: string | undefined, max: number, field: string): void => {
  if (value && value.length > max) {
    throw new Error(`${field} must be 1-${max} characters`)
  }
}

const ensureCacheRoot = (root: string): void => {
  if (skillMetadataCache.root !== root) {
    skillMetadataCache.root = root
    skillMetadataCache.dirty = true
    skillMetadataCache.items = []
  }
}

const markSkillCacheDirty = (): void => {
  skillMetadataCache.dirty = true
}

const ensureSkillsDir = async (): Promise<string> => {
  const root = path.join(app.getPath('userData'), SKILLS_DIR)
  await fs.mkdir(root, { recursive: true })
  ensureCacheRoot(root)
  return root
}

const skillDirExists = async (dirPath: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

const buildSkillMetadata = (
  frontmatter: SkillFrontmatter,
  options?: { name?: string; frontmatterName?: string }
): SkillMetadata => ({
  name: options?.name ?? frontmatter.name,
  frontmatterName: options?.frontmatterName ?? frontmatter.name,
  description: frontmatter.description,
  license: frontmatter.license,
  compatibility: frontmatter.compatibility,
  metadata: frontmatter.metadata,
  allowedTools: frontmatter.allowedTools
})

const resolveSkillNameForDirectory = (frontmatterName: string): string => {
  const normalized = normalizeSkillName(frontmatterName)
  return normalized || frontmatterName
}

const readSkillSourceInfo = async (skillDir: string): Promise<SkillSourceInfo | null> => {
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

const writeSkillSourceInfo = async (skillDir: string, source?: string): Promise<void> => {
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
    return DatabaseService.isReady()
  } catch {
    return false
  }
}

const readSkillMetadata = async (
  skillDir: string
): Promise<SkillMetadataCacheItem | null> => {
  const skillFile = path.join(skillDir, SKILL_FILE)
  if (!existsSync(skillFile)) {
    return null
  }

  try {
    const stat = await fs.stat(skillFile)
    const content = await fs.readFile(skillFile, 'utf-8')
    const parsed = parseFrontmatter(content)
    const rawName = parsed.frontmatter.name
    const normalizedName = resolveSkillNameForDirectory(rawName)
    validateSkillName(normalizedName)
    validateSkillDescription(parsed.frontmatter.description)
    validateOptionalLength(parsed.frontmatter.compatibility, 500, 'Skill compatibility')

    const sourceInfo = await readSkillSourceInfo(skillDir)
    return {
      ...buildSkillMetadata(parsed.frontmatter, {
        name: path.basename(skillDir),
        frontmatterName: rawName
      }),
      mtimeMs: stat.mtimeMs,
      source: sourceInfo?.source
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
    const raw = DatabaseService.getConfigValue(SKILL_METADATA_CACHE_KEY)
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
  DatabaseService.saveConfigValue(
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

const runCommand = async (command: string, args: string[]): Promise<string> => {
  try {
    const result = await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024 })
    return result.stdout?.toString() || ''
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      const joined = [command, ...args].join(' ')
      throw new Error(`Command not available: ${joined}`)
    }
    throw error
  }
}

const tryCommand = async (command: string, args: string[]): Promise<string | null> => {
  try {
    return await runCommand(command, args)
  } catch (error: any) {
    if (error?.message?.startsWith('Command not available')) {
      return null
    }
    throw error
  }
}

const isUnsafeArchivePath = (entry: string): boolean => {
  const normalized = entry.replace(/\\/g, '/')
  if (!normalized) return false
  if (normalized.startsWith('/') || normalized.startsWith('\\')) return true
  if (/^[A-Za-z]:/.test(normalized)) return true
  if (normalized.includes('..')) {
    const parts = normalized.split('/')
    if (parts.includes('..')) return true
  }
  return false
}

const listArchiveEntries = async (archivePath: string, type: ArchiveType): Promise<string[]> => {
  if (type === 'zip') {
    const output = await tryCommand('unzip', ['-Z', '-1', archivePath])
    if (output !== null) {
      return output.split(/\r?\n/).filter(Boolean)
    }
    const tarOutput = await runCommand('tar', ['-tf', archivePath])
    return tarOutput.split(/\r?\n/).filter(Boolean)
  }

  const args = type === 'targz' ? ['-tzf', archivePath] : ['-tf', archivePath]
  const output = await runCommand('tar', args)
  return output.split(/\r?\n/).filter(Boolean)
}

const extractArchive = async (archivePath: string, destDir: string, type: ArchiveType): Promise<void> => {
  const entries = await listArchiveEntries(archivePath, type)
  const hasUnsafe = entries.some(isUnsafeArchivePath)
  if (hasUnsafe) {
    throw new Error('Archive contains unsafe paths')
  }

  if (type === 'zip') {
    const unzipOutput = await tryCommand('unzip', ['-q', archivePath, '-d', destDir])
    if (unzipOutput !== null) {
      return
    }
    await runCommand('tar', ['-xf', archivePath, '-C', destDir])
    return
  }

  if (type === 'targz') {
    await runCommand('tar', ['-xzf', archivePath, '-C', destDir])
    return
  }

  await runCommand('tar', ['-xf', archivePath, '-C', destDir])
}

const findSkillDirectories = async (rootDir: string, maxDepth = 5): Promise<string[]> => {
  const results: string[] = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    const entries = await fs.readdir(current.dir, { withFileTypes: true })
    const hasSkill = entries.some(entry => entry.isFile() && entry.name === SKILL_FILE)
    if (hasSkill) {
      results.push(current.dir)
      continue
    }

    if (current.depth >= maxDepth) {
      continue
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 })
      }
    }
  }

  return results
}

const installSkillFromDirectory = async (
  sourceDir: string,
  args: LoadSkillArgs,
  root: string,
  allowOverwrite: boolean,
  sourceLabel: string,
  overrideName?: string
): Promise<SkillMetadata> => {
  const skillFile = path.join(sourceDir, SKILL_FILE)
  const content = await fs.readFile(skillFile, 'utf-8')
  const parsed = parseFrontmatter(content)
  const rawName = parsed.frontmatter.name
  const normalizedName = resolveSkillNameForDirectory(rawName)
  validateSkillName(normalizedName)
  validateSkillDescription(parsed.frontmatter.description)
  validateOptionalLength(parsed.frontmatter.compatibility, 500, 'Skill compatibility')

  if (args.name && args.name !== normalizedName) {
    throw new Error(`Skill name mismatch: expected "${args.name}"`)
  }

  const targetName = overrideName ?? normalizedName
  validateSkillName(targetName)
  const destDir = path.join(root, targetName)
  if (await skillDirExists(destDir)) {
    if (!allowOverwrite) {
      throw new Error(`Skill "${targetName}" already installed`)
    }
    await fs.rm(destDir, { recursive: true, force: true })
  }

  await fs.cp(sourceDir, destDir, { recursive: true })
  await writeSkillSourceInfo(destDir, sourceLabel)

  return {
    ...buildSkillMetadata(parsed.frontmatter, {
      name: targetName,
      frontmatterName: rawName
    }),
    name: targetName,
    source: sourceLabel
  }
}

class SkillService {
  static async listSkills(): Promise<SkillMetadata[]> {
    const root = await ensureSkillsDir()
    if (!skillMetadataCache.dirty) {
      return [...skillMetadataCache.items]
    }

    const cached = await readMetadataCacheFile(root)
    if (cached && await isCacheValid(root, cached)) {
      const items = cached.items.map(({ mtimeMs: _mtimeMs, ...rest }) => rest)
      skillMetadataCache.items = items
      skillMetadataCache.dirty = false
      return [...items]
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
    const items = sorted.map(({ mtimeMs: _mtimeMs, ...rest }) => rest)
    skillMetadataCache.items = items
    skillMetadataCache.dirty = false
    return [...items]
  }

  static async getSkillContent(name: string): Promise<string> {
    validateSkillName(name)
    const root = await ensureSkillsDir()
    const skillFile = path.join(root, name, SKILL_FILE)
    return await fs.readFile(skillFile, 'utf-8')
  }

  static async loadSkill(args: LoadSkillArgs): Promise<SkillMetadata> {
    if (!args?.source) {
      throw new Error('source is required')
    }

    const root = await ensureSkillsDir()
    const allowOverwrite = Boolean(args.allowOverwrite)
    const archiveType = getArchiveType(args.source)

    if (isUrl(args.source) && archiveType) {
      const tmpBase = path.join(root, '.tmp')
      await fs.mkdir(tmpBase, { recursive: true })
      const tempDir = await fs.mkdtemp(path.join(tmpBase, 'skill-'))
      const archiveExt = archiveType === 'targz' ? 'tar.gz' : archiveType
      const archiveName = path.basename(new URL(args.source).pathname) || `skill.${archiveExt}`
      const archivePath = path.join(tempDir, archiveName)
      const extractDir = path.join(tempDir, 'extracted')
      await fs.mkdir(extractDir, { recursive: true })

      try {
        const response = await fetch(args.source)
        if (!response.ok) {
          throw new Error(`Failed to fetch skill from URL: ${response.status} ${response.statusText}`)
        }
        const buffer = Buffer.from(await response.arrayBuffer())
        await fs.writeFile(archivePath, buffer)

        await extractArchive(archivePath, extractDir, archiveType)
        const skillDirs = await findSkillDirectories(extractDir)
        if (skillDirs.length !== 1) {
          throw new Error('Archive must contain exactly one SKILL.md file')
        }

        const skillDir = skillDirs[0]
        const metadata = await installSkillFromDirectory(
          skillDir,
          args,
          root,
          allowOverwrite,
          args.source
        )
        markSkillCacheDirty()
        return metadata
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
      }
    }

    if (isUrl(args.source)) {
      const response = await fetch(args.source)
      if (!response.ok) {
        throw new Error(`Failed to fetch skill from URL: ${response.status} ${response.statusText}`)
      }
      const content = await response.text()
      const parsed = parseFrontmatter(content)
      const rawName = parsed.frontmatter.name
      const normalizedName = resolveSkillNameForDirectory(rawName)
      validateSkillName(normalizedName)
      validateSkillDescription(parsed.frontmatter.description)
      validateOptionalLength(parsed.frontmatter.compatibility, 500, 'Skill compatibility')
      if (args.name && args.name !== normalizedName) {
        throw new Error(`Skill name mismatch: expected "${args.name}"`)
      }

      const destDir = path.join(root, normalizedName)
      if (await skillDirExists(destDir)) {
        if (!allowOverwrite) {
          throw new Error(`Skill "${normalizedName}" already installed`)
        }
        await fs.rm(destDir, { recursive: true, force: true })
      }

      await fs.mkdir(destDir, { recursive: true })
      await fs.writeFile(path.join(destDir, SKILL_FILE), content, 'utf-8')
      await writeSkillSourceInfo(destDir, args.source)
      markSkillCacheDirty()
      return {
        ...buildSkillMetadata(parsed.frontmatter, {
          name: normalizedName,
          frontmatterName: rawName
        }),
        source: args.source
      }
    }

    const sourcePath = path.isAbsolute(args.source)
      ? args.source
      : path.resolve(args.source)

    const sourceArchiveType = getArchiveType(sourcePath)
    if (sourceArchiveType) {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-'))
      const extractDir = path.join(tempDir, 'extracted')
      await fs.mkdir(extractDir, { recursive: true })

      try {
        await extractArchive(sourcePath, extractDir, sourceArchiveType)
        const skillDirs = await findSkillDirectories(extractDir)
        if (skillDirs.length !== 1) {
          throw new Error('Archive must contain exactly one SKILL.md file')
        }

        const skillDir = skillDirs[0]
        const metadata = await installSkillFromDirectory(
          skillDir,
          args,
          root,
          allowOverwrite,
          sourcePath
        )
        markSkillCacheDirty()
        return metadata
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
      }
    }

    const stat = await fs.stat(sourcePath)
    if (stat.isDirectory()) {
      const metadata = await installSkillFromDirectory(
        sourcePath,
        args,
        root,
        allowOverwrite,
        sourcePath
      )
      markSkillCacheDirty()
      return metadata
    }

    const content = await fs.readFile(sourcePath, 'utf-8')
    const parsed = parseFrontmatter(content)
    const rawName = parsed.frontmatter.name
    const normalizedName = resolveSkillNameForDirectory(rawName)
    validateSkillName(normalizedName)
    validateSkillDescription(parsed.frontmatter.description)
    validateOptionalLength(parsed.frontmatter.compatibility, 500, 'Skill compatibility')
    if (args.name && args.name !== normalizedName) {
      throw new Error(`Skill name mismatch: expected "${args.name}"`)
    }

    const destDir = path.join(root, normalizedName)
    if (await skillDirExists(destDir)) {
      if (!allowOverwrite) {
        throw new Error(`Skill "${normalizedName}" already installed`)
      }
      await fs.rm(destDir, { recursive: true, force: true })
    }

    await fs.mkdir(destDir, { recursive: true })
    await fs.writeFile(path.join(destDir, SKILL_FILE), content, 'utf-8')
    await writeSkillSourceInfo(destDir, sourcePath)
    markSkillCacheDirty()
    return {
      ...buildSkillMetadata(parsed.frontmatter, {
        name: normalizedName,
        frontmatterName: rawName
      }),
      source: sourcePath
    }
  }

  static async importSkillsFromFolder(folderPath: string): Promise<SkillImportSummary> {
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
    const currentSkills = await SkillService.listSkills()
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
        const parsed = parseFrontmatter(content)
        const rawName = parsed.frontmatter.name
        const normalizedName = resolveSkillNameForDirectory(rawName)
        validateSkillName(normalizedName)
        validateSkillDescription(parsed.frontmatter.description)
        validateOptionalLength(parsed.frontmatter.compatibility, 500, 'Skill compatibility')

        const sourcePath = path.resolve(skillDir)
        const existingBySource = currentBySource.get(sourcePath)
        let targetName = normalizedName
        let allowOverwrite = false
        if (existingBySource) {
          targetName = existingBySource.name
          allowOverwrite = true
        } else if (existing.has(targetName)) {
          const folderName = path.basename(folderPath)
          targetName = buildConflictName(targetName, folderName, existing)
          renamed.push({ from: rawName, to: targetName })
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
