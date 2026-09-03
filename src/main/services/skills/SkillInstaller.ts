import path from 'path'
import * as fs from 'fs/promises'
import {
  SKILL_FILE,
  parseSkillMetadata,
  validateSkillName
} from './SkillParser'
import {
  ensureSkillsDir,
  writeSkillSourceInfo,
  markSkillCacheDirty
} from './SkillCache'
import {
  createSkillInstallTransaction,
  createSkillStagingDirectory,
  removeSkillInstallTransaction,
  removeSkillStagingDirectory,
  recoverSkillInstallTransactions,
  updateSkillInstallTransaction,
  validateStagedSkillTree,
  withSkillRootLock
} from './SkillInstallation'
import {
  extractArchive,
  fetchUrlText,
  fetchUrlToFile,
  getArchiveType,
  isUrl,
  findSkillDirectories
} from './SkillCollector'
import { resolveSkillPath } from './SkillPathResolver'

export type LoadSkillArgs = {
  source: string
  name?: string
  allowOverwrite?: boolean
}

type InstallOptions = {
  preserveBackup?: boolean
}

const isMissingPathError = (error: unknown): boolean => (
  typeof error === 'object'
  && error !== null
  && 'code' in error
  && (error as NodeJS.ErrnoException).code === 'ENOENT'
)

const readPathStat = async (targetPath: string): Promise<Awaited<ReturnType<typeof fs.lstat>> | null> => {
  try {
    return await fs.lstat(targetPath)
  } catch (error) {
    if (isMissingPathError(error)) {
      return null
    }
    throw error
  }
}

const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

const readSkillMetadataFromDirectory = async (
  skillDir: string,
  args: LoadSkillArgs
): Promise<ReturnType<typeof parseSkillMetadata>> => {
  const resolvedSkillFile = await resolveSkillPath(skillDir, SKILL_FILE, 'Skill file')
  const stat = await fs.stat(resolvedSkillFile.canonicalPath)
  if (!stat.isFile()) {
    throw new Error('SKILL.md must be a regular file')
  }
  const content = await fs.readFile(resolvedSkillFile.canonicalPath, 'utf-8')
  const parsed = parseSkillMetadata(content)
  if (args.name && args.name !== parsed.normalizedName) {
    throw new Error(`Skill name mismatch: expected "${args.name}"`)
  }
  return parsed
}

const validateTargetName = (targetName: string): void => {
  validateSkillName(targetName)
}

const assertTargetAvailable = async (
  root: string,
  targetName: string,
  allowOverwrite: boolean
): Promise<string> => {
  validateTargetName(targetName)
  const destination = path.join(root, targetName)
  const existing = await readPathStat(destination)
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) {
    throw new Error(`Skill target is not a directory: ${destination}`)
  }
  if (existing && !allowOverwrite) {
    throw new Error(`Skill "${targetName}" already installed`)
  }
  return destination
}

const stageSkillDirectory = async (
  sourceDir: string,
  sourceLabel: string,
  root: string,
  args: LoadSkillArgs
): Promise<{ stagingPath: string; parsed: ReturnType<typeof parseSkillMetadata> }> => {
  const stagingPath = await createSkillStagingDirectory(root)
  try {
    await fs.cp(sourceDir, stagingPath, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true
    })
    await writeSkillSourceInfo(stagingPath, sourceLabel)
    await validateStagedSkillTree(stagingPath)
    const parsed = await readSkillMetadataFromDirectory(stagingPath, args)
    return { stagingPath, parsed }
  } catch (error) {
    await removeSkillStagingDirectory(stagingPath).catch(() => undefined)
    throw error
  }
}

const stageSkillContent = async (
  content: string,
  sourceLabel: string,
  root: string,
  args: LoadSkillArgs,
  mode?: number
): Promise<{ stagingPath: string; parsed: ReturnType<typeof parseSkillMetadata> }> => {
  const stagingPath = await createSkillStagingDirectory(root)
  try {
    await fs.writeFile(path.join(stagingPath, SKILL_FILE), content, 'utf-8')
    await writeSkillSourceInfo(stagingPath, sourceLabel)
    if (mode !== undefined) {
      await fs.chmod(path.join(stagingPath, SKILL_FILE), mode & 0o7777)
    }
    await validateStagedSkillTree(stagingPath)
    const parsed = await readSkillMetadataFromDirectory(stagingPath, args)
    return { stagingPath, parsed }
  } catch (error) {
    await removeSkillStagingDirectory(stagingPath).catch(() => undefined)
    throw error
  }
}

const publishSkill = async (
  root: string,
  targetName: string,
  stagingPath: string,
  allowOverwrite: boolean,
  preserveBackup = false
): Promise<void> => {
  const destination = await assertTargetAvailable(root, targetName, allowOverwrite)
  const transaction = await createSkillInstallTransaction(
    root,
    targetName,
    stagingPath,
    preserveBackup
  )
  const existing = await readPathStat(destination)
  let previousMoved = false

  try {
    if (existing) {
      await fs.rename(destination, transaction.backupPath)
      previousMoved = true
      await updateSkillInstallTransaction(root, transaction, 'previous-moved')
    }
    await fs.rename(stagingPath, destination)
  } catch (error) {
    if (!previousMoved) {
      throw new Error(`${errorMessage(error)}; recoverable staging: ${stagingPath}`)
    }

    let rollbackError: unknown
    try {
      const publishedCandidate = await readPathStat(destination)
      if (publishedCandidate) {
        const failedCandidatePath = path.join(
          root,
          '.skill-backups',
          `${targetName}-failed-${transaction.id}`
        )
        await fs.rename(destination, failedCandidatePath)
      }
      await fs.rename(transaction.backupPath, destination)
    } catch (rollbackFailure) {
      rollbackError = rollbackFailure
    }

    if (!rollbackError) {
      await removeSkillStagingDirectory(stagingPath).catch(() => undefined)
      await removeSkillInstallTransaction(root, transaction).catch(() => undefined)
      throw new Error(errorMessage(error))
    }

    throw new Error(
      `${errorMessage(error)}; rollback failed: ${errorMessage(rollbackError)}; `
      + `recoverable backup: ${transaction.backupPath}`
    )
  }

  await removeSkillInstallTransaction(root, transaction).catch(error => {
    console.error('[SkillService] Failed to remove completed skill install transaction:', error)
  })
  if (previousMoved && !preserveBackup) {
    await fs.rm(transaction.backupPath, { recursive: true, force: true }).catch(error => {
      console.error('[SkillService] Failed to remove previous skill backup:', transaction.backupPath, error)
    })
  }
}

export const installSkillFromDirectory = async (
  sourceDir: string,
  args: LoadSkillArgs,
  root: string,
  allowOverwrite: boolean,
  sourceLabel: string,
  overrideName?: string,
  options?: InstallOptions
): Promise<SkillMetadata> => {
  const sourceStat = await fs.stat(sourceDir)
  if (!sourceStat.isDirectory()) {
    throw new Error('Skill source must be a directory')
  }
  const sourceParsed = await readSkillMetadataFromDirectory(sourceDir, args)
  const targetName = overrideName ?? sourceParsed.normalizedName
  validateTargetName(targetName)
  const destination = await assertTargetAvailable(root, targetName, allowOverwrite)
  if (await readPathStat(destination)) {
    const [canonicalSource, canonicalDestination] = await Promise.all([
      fs.realpath(sourceDir),
      fs.realpath(destination)
    ])
    if (canonicalSource === canonicalDestination) {
      throw new Error('Skill source and destination are the same directory')
    }
  }

  const { stagingPath, parsed } = await stageSkillDirectory(
    sourceDir,
    sourceLabel,
    root,
    args
  )
  if (parsed.normalizedName !== sourceParsed.normalizedName) {
    await removeSkillStagingDirectory(stagingPath).catch(() => undefined)
    throw new Error('Skill metadata changed while preparing installation')
  }

  await publishSkill(root, targetName, stagingPath, allowOverwrite, options?.preserveBackup)
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
  sourceLabel: string,
  mode?: number
): Promise<SkillMetadata> => {
  const parsedSource = parseSkillMetadata(content)
  if (args.name && args.name !== parsedSource.normalizedName) {
    throw new Error(`Skill name mismatch: expected "${args.name}"`)
  }
  await assertTargetAvailable(root, parsedSource.normalizedName, allowOverwrite)

  const { stagingPath, parsed } = await stageSkillContent(
    content,
    sourceLabel,
    root,
    args,
    mode
  )
  await publishSkill(root, parsed.normalizedName, stagingPath, allowOverwrite)
  return {
    ...parsed.metadata,
    source: sourceLabel
  }
}

const loadSkillWithinRoot = async (
  args: LoadSkillArgs,
  root: string
): Promise<SkillMetadata> => {
  const allowOverwrite = Boolean(args.allowOverwrite)
  const archiveType = getArchiveType(args.source)

  if (isUrl(args.source) && archiveType) {
    const tempDir = await createSkillStagingDirectory(root)
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

      const metadata = await installSkillFromDirectory(
        skillDirs[0],
        args,
        root,
        allowOverwrite,
        args.source
      )
      markSkillCacheDirty()
      return metadata
    } finally {
      await removeSkillStagingDirectory(tempDir)
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
    const tempDir = await createSkillStagingDirectory(root)
    const extractDir = path.join(tempDir, 'extracted')
    await fs.mkdir(extractDir, { recursive: true })

    try {
      await extractArchive(sourcePath, extractDir, sourceArchiveType)
      const skillDirs = await findSkillDirectories(extractDir)
      if (skillDirs.length !== 1) {
        throw new Error('Archive must contain exactly one SKILL.md file')
      }

      const metadata = await installSkillFromDirectory(
        skillDirs[0],
        args,
        root,
        allowOverwrite,
        sourcePath
      )
      markSkillCacheDirty()
      return metadata
    } finally {
      await removeSkillStagingDirectory(tempDir)
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
  if (!stat.isFile()) {
    throw new Error('Skill source must be a file or directory')
  }

  const content = await fs.readFile(sourcePath, 'utf-8')
  const metadata = await installSkillFromContent(
    content,
    args,
    root,
    allowOverwrite,
    sourcePath,
    stat.mode
  )
  markSkillCacheDirty()
  return metadata
}

export const loadSkill = async (args: LoadSkillArgs): Promise<SkillMetadata> => {
  if (!args?.source) {
    throw new Error('source is required')
  }

  const root = await ensureSkillsDir()
  return await withSkillRootLock(root, async () => {
    await recoverSkillInstallTransactions(root)
    markSkillCacheDirty()
    return await loadSkillWithinRoot(args, root)
  })
}
