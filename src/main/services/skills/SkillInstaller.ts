import path from 'path'
import * as fs from 'fs/promises'
import os from 'os'
import {
  SKILL_FILE,
  parseSkillMetadata,
  validateSkillName
} from './SkillParser'
import {
  ensureSkillsDir,
  skillDirExists,
  writeSkillSourceInfo,
  markSkillCacheDirty
} from './SkillCache'
import {
  extractArchive,
  fetchUrlText,
  fetchUrlToFile,
  getArchiveType,
  isUrl,
  findSkillDirectories
} from './SkillCollector'

export type LoadSkillArgs = {
  source: string
  name?: string
  allowOverwrite?: boolean
}

const prepareSkillDestination = async (
  root: string,
  targetName: string,
  allowOverwrite: boolean
): Promise<string> => {
  validateSkillName(targetName)
  const destDir = path.join(root, targetName)
  if (await skillDirExists(destDir)) {
    if (!allowOverwrite) {
      throw new Error(`Skill "${targetName}" already installed`)
    }
    await fs.rm(destDir, { recursive: true, force: true })
  }
  return destDir
}

export const installSkillFromDirectory = async (
  sourceDir: string,
  args: LoadSkillArgs,
  root: string,
  allowOverwrite: boolean,
  sourceLabel: string,
  overrideName?: string
): Promise<SkillMetadata> => {
  const skillFile = path.join(sourceDir, SKILL_FILE)
  const content = await fs.readFile(skillFile, 'utf-8')
  const parsed = parseSkillMetadata(content)

  if (args.name && args.name !== parsed.normalizedName) {
    throw new Error(`Skill name mismatch: expected "${args.name}"`)
  }

  const targetName = overrideName ?? parsed.normalizedName
  const destDir = await prepareSkillDestination(root, targetName, allowOverwrite)
  await fs.cp(sourceDir, destDir, { recursive: true })
  await writeSkillSourceInfo(destDir, sourceLabel)

  return {
    ...parsed.metadata,
    name: targetName,
    frontmatterName: parsed.rawName,
    source: sourceLabel
  }
}

const installSkillFromContent = async (
  content: string,
  args: LoadSkillArgs,
  root: string,
  allowOverwrite: boolean,
  sourceLabel: string
): Promise<SkillMetadata> => {
  const parsed = parseSkillMetadata(content)
  if (args.name && args.name !== parsed.normalizedName) {
    throw new Error(`Skill name mismatch: expected "${args.name}"`)
  }

  const destDir = await prepareSkillDestination(root, parsed.normalizedName, allowOverwrite)
  await fs.mkdir(destDir, { recursive: true })
  await fs.writeFile(path.join(destDir, SKILL_FILE), content, 'utf-8')
  await writeSkillSourceInfo(destDir, sourceLabel)

  return {
    ...parsed.metadata,
    source: sourceLabel
  }
}

export const loadSkill = async (args: LoadSkillArgs): Promise<SkillMetadata> => {
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
      await fetchUrlToFile(args.source, archivePath)
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
    const content = await fetchUrlText(args.source)
    const metadata = await installSkillFromContent(content, args, root, allowOverwrite, args.source)
    markSkillCacheDirty()
    return metadata
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
  const metadata = await installSkillFromContent(content, args, root, allowOverwrite, sourcePath)
  markSkillCacheDirty()
  return metadata
}
