import { randomUUID } from 'crypto'
import type { Dirent } from 'fs'
import path from 'path'
import * as fs from 'fs/promises'
import { isPathWithin } from '@main/services/filesystem/WorkspacePathBoundary'
import {
  SKILL_FILE,
  parseSkillMetadata,
  validateSkillName
} from './SkillParser'
import { resolveSkillPath, SkillPathError } from './SkillPathResolver'

export const SKILL_STAGING_DIRECTORY = '.skill-staging'
export const SKILL_BACKUP_DIRECTORY = '.skill-backups'
export const SKILL_TRANSACTION_DIRECTORY = '.skill-transactions'
export const SKILL_LOCK_DIRECTORY = '.skill-lock'

export const SKILL_INTERNAL_DIRECTORIES = [
  '.tmp',
  SKILL_STAGING_DIRECTORY,
  SKILL_BACKUP_DIRECTORY,
  SKILL_TRANSACTION_DIRECTORY,
  SKILL_LOCK_DIRECTORY
] as const

export const isSkillInternalDirectory = (name: string): boolean => {
  return (SKILL_INTERNAL_DIRECTORIES as readonly string[]).includes(name)
}

type SkillInstallTransactionState = 'staged' | 'previous-moved'

export type SkillInstallTransaction = {
  version: 1
  id: string
  pid: number
  state: SkillInstallTransactionState
  targetName: string
  targetPath: string
  stagingPath: string
  backupPath: string
  preserveBackup?: boolean
  createdAt: number
}

type ProcessState = 'active' | 'stale' | 'unknown'

const isMissingPathError = (error: unknown): boolean => (
  typeof error === 'object'
  && error !== null
  && 'code' in error
  && (error as NodeJS.ErrnoException).code === 'ENOENT'
)

const isPathInside = (root: string, candidate: string): boolean => {
  return isPathWithin(path.resolve(candidate), path.resolve(root))
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ensureInternalDirectory = async (root: string, name: string): Promise<string> => {
  const directory = path.join(root, name)
  await fs.mkdir(directory, { recursive: true })
  const stat = await fs.lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Skill internal path is not a directory: ${directory}`)
  }
  return directory
}

const readLstat = async (targetPath: string): Promise<Awaited<ReturnType<typeof fs.lstat>> | null> => {
  try {
    return await fs.lstat(targetPath)
  } catch (error) {
    if (isMissingPathError(error)) {
      return null
    }
    throw error
  }
}

const getProcessState = (pid: unknown): ProcessState => {
  if (!Number.isInteger(pid) || (pid as number) <= 0) {
    return 'unknown'
  }

  try {
    process.kill(pid as number, 0)
    return 'active'
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'ESRCH') {
      return 'stale'
    }
    if (code === 'EPERM') {
      return 'active'
    }
    return 'unknown'
  }
}

const lockOwnerPath = (root: string): string => {
  return path.join(root, SKILL_LOCK_DIRECTORY, 'owner.json')
}

const lockReclaimMarkerPath = (root: string): string => {
  return path.join(root, SKILL_LOCK_DIRECTORY, 'reclaiming')
}

const readLockState = async (root: string): Promise<ProcessState> => {
  const lockPath = path.join(root, SKILL_LOCK_DIRECTORY)
  try {
    const stat = await fs.lstat(lockPath)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      return 'unknown'
    }

    const raw = await fs.readFile(lockOwnerPath(root), 'utf-8')
    const owner = JSON.parse(raw) as { pid?: number }
    return getProcessState(owner.pid)
  } catch {
    return 'unknown'
  }
}

const acquireSkillRootLock = async (root: string): Promise<string> => {
  const lockPath = path.join(root, SKILL_LOCK_DIRECTORY)
  const token = randomUUID()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.mkdir(lockPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error

      const state = await readLockState(root)
      if (state !== 'stale') {
        throw new Error(`Skill root is busy; lock retained at ${lockPath}`)
      }

      try {
        await fs.writeFile(
          lockReclaimMarkerPath(root),
          `${JSON.stringify({ pid: process.pid, token, createdAt: Date.now() })}\n`,
          { encoding: 'utf-8', flag: 'wx' }
        )
      } catch (reclaimError) {
        if ((reclaimError as NodeJS.ErrnoException)?.code === 'EEXIST') {
          throw new Error(`Skill root is busy; lock retained at ${lockPath}`)
        }
        throw reclaimError
      }

      const stateAfterClaim = await readLockState(root)
      if (stateAfterClaim !== 'stale') {
        await fs.rm(lockReclaimMarkerPath(root), { force: true }).catch(() => undefined)
        throw new Error(`Skill root is busy; lock retained at ${lockPath}`)
      }
      await fs.rm(lockPath, { recursive: true, force: true })
      continue
    }

    try {
      await fs.writeFile(
        lockOwnerPath(root),
        `${JSON.stringify({ pid: process.pid, token, createdAt: Date.now() })}\n`,
        { encoding: 'utf-8', flag: 'wx' }
      )
      return token
    } catch (error) {
      // mkdir succeeded in this iteration, so only this branch owns cleanup.
      await fs.rm(lockPath, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  }

  throw new Error(`Skill root is busy; lock retained at ${lockPath}`)
}

const releaseSkillRootLock = async (root: string, token: string): Promise<void> => {
  const ownerPath = lockOwnerPath(root)
  try {
    const owner = JSON.parse(await fs.readFile(ownerPath, 'utf-8')) as { token?: string }
    if (owner.token !== token) {
      return
    }
    await fs.rm(path.join(root, SKILL_LOCK_DIRECTORY), { recursive: true, force: true })
  } catch {
    // Keep an unrecognizable lock for the next process to inspect safely.
  }
}

export const withSkillRootLock = async <T>(
  root: string,
  operation: () => Promise<T>
): Promise<T> => {
  const token = await acquireSkillRootLock(root)
  try {
    return await operation()
  } finally {
    await releaseSkillRootLock(root, token)
  }
}

export const createSkillStagingDirectory = async (root: string): Promise<string> => {
  const stagingRoot = await ensureInternalDirectory(root, SKILL_STAGING_DIRECTORY)
  return await fs.mkdtemp(path.join(stagingRoot, `${process.pid}-${randomUUID()}-`))
}

export const createSkillInstallTransaction = async (
  root: string,
  targetName: string,
  stagingPath: string,
  preserveBackup = false
): Promise<SkillInstallTransaction> => {
  validateSkillName(targetName)
  const stagingRoot = await ensureInternalDirectory(root, SKILL_STAGING_DIRECTORY)
  const backupRoot = await ensureInternalDirectory(root, SKILL_BACKUP_DIRECTORY)
  const transactionRoot = await ensureInternalDirectory(root, SKILL_TRANSACTION_DIRECTORY)
  const resolvedStagingPath = path.resolve(stagingPath)
  if (
    path.dirname(resolvedStagingPath) !== path.resolve(stagingRoot)
    || !isPathInside(stagingRoot, resolvedStagingPath)
  ) {
    throw new Error(`Skill staging path escapes installation root: ${stagingPath}`)
  }

  const id = randomUUID()
  const transaction: SkillInstallTransaction = {
    version: 1,
    id,
    pid: process.pid,
    state: 'staged',
    targetName,
    targetPath: path.join(root, targetName),
    stagingPath: resolvedStagingPath,
    backupPath: path.join(backupRoot, `${targetName}-${id}`),
    preserveBackup,
    createdAt: Date.now()
  }

  const recordPath = path.join(transactionRoot, `${id}.json`)
  await writeTransactionRecord(transactionRoot, recordPath, transaction, true)
  return transaction
}

const writeTransactionRecord = async (
  transactionRoot: string,
  recordPath: string,
  transaction: SkillInstallTransaction,
  exclusive: boolean
): Promise<void> => {
  const tempPath = path.join(
    transactionRoot,
    `.${path.basename(recordPath)}.${process.pid}-${randomUUID()}.tmp`
  )
  await fs.writeFile(
    tempPath,
    `${JSON.stringify(transaction, null, 2)}\n`,
    { encoding: 'utf-8', flag: exclusive ? 'wx' : 'w' }
  )
  try {
    await fs.rename(tempPath, recordPath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export const updateSkillInstallTransaction = async (
  root: string,
  transaction: SkillInstallTransaction,
  state: SkillInstallTransactionState
): Promise<void> => {
  const transactionRoot = await ensureInternalDirectory(root, SKILL_TRANSACTION_DIRECTORY)
  const next = { ...transaction, state }
  await writeTransactionRecord(
    transactionRoot,
    path.join(transactionRoot, `${transaction.id}.json`),
    next,
    false
  )
  transaction.state = state
}

export const removeSkillInstallTransaction = async (
  root: string,
  transaction: SkillInstallTransaction
): Promise<void> => {
  await fs.rm(path.join(root, SKILL_TRANSACTION_DIRECTORY, `${transaction.id}.json`), {
    force: true
  })
}

export const removeSkillStagingDirectory = async (stagingPath: string): Promise<void> => {
  await fs.rm(stagingPath, { recursive: true, force: true })
}

type SkillDirectoryInspection =
  | { state: 'complete'; parsed: ReturnType<typeof parseSkillMetadata> }
  | { state: 'incomplete'; error?: unknown }
  | { state: 'unreadable'; error: unknown }

export const inspectSkillDirectory = async (skillDir: string): Promise<SkillDirectoryInspection> => {
  let stat: Awaited<ReturnType<typeof fs.lstat>> | null
  try {
    stat = await readLstat(skillDir)
  } catch (error) {
    return { state: 'unreadable', error }
  }
  if (!stat) {
    return { state: 'incomplete' }
  }
  if (stat.isSymbolicLink()) {
    return { state: 'unreadable', error: new Error(`Skill directory is a symbolic link: ${skillDir}`) }
  }
  if (!stat.isDirectory()) {
    return { state: 'incomplete' }
  }

  let resolved
  try {
    resolved = await resolveSkillPath(skillDir, SKILL_FILE, 'Skill file')
  } catch (error) {
    if (
      error instanceof SkillPathError
      && (error.code === 'PATH_NOT_FOUND' || error.code === 'PATH_CANONICALIZATION_FAILED')
    ) {
      return { state: 'incomplete' }
    }
    return { state: 'unreadable', error }
  }

  let skillFileStat: Awaited<ReturnType<typeof fs.stat>>
  try {
    skillFileStat = await fs.stat(resolved.canonicalPath)
  } catch (error) {
    if (isMissingPathError(error)) {
      return { state: 'incomplete' }
    }
    return { state: 'unreadable', error }
  }
  if (!skillFileStat.isFile()) {
    return { state: 'incomplete' }
  }

  let content: string
  try {
    content = await fs.readFile(resolved.canonicalPath, 'utf-8')
  } catch (error) {
    if (isMissingPathError(error)) {
      return { state: 'incomplete' }
    }
    return { state: 'unreadable', error }
  }
  try {
    return { state: 'complete', parsed: parseSkillMetadata(content) }
  } catch (error) {
    return { state: 'incomplete', error }
  }
}

const parseTransaction = (raw: string): SkillInstallTransaction | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<SkillInstallTransaction>
    if (
      parsed.version !== 1
      || typeof parsed.id !== 'string'
      || !Number.isInteger(parsed.pid)
      || (parsed.state !== 'staged' && parsed.state !== 'previous-moved')
      || typeof parsed.targetName !== 'string'
      || typeof parsed.targetPath !== 'string'
      || typeof parsed.stagingPath !== 'string'
      || typeof parsed.backupPath !== 'string'
      || typeof parsed.createdAt !== 'number'
    ) {
      return null
    }
    validateSkillName(parsed.targetName)
    return parsed as SkillInstallTransaction
  } catch {
    return null
  }
}

const isSafeTransaction = async (
  root: string,
  transaction: SkillInstallTransaction,
  recordPath: string
): Promise<boolean> => {
  const stagingRoot = path.join(root, SKILL_STAGING_DIRECTORY)
  const backupRoot = path.join(root, SKILL_BACKUP_DIRECTORY)
  const expectedTarget = path.join(root, transaction.targetName)
  if (
    !UUID_REGEX.test(transaction.id)
    || path.basename(recordPath) !== `${transaction.id}.json`
    || path.resolve(transaction.targetPath) !== path.resolve(expectedTarget)
    || path.dirname(path.resolve(transaction.stagingPath)) !== path.resolve(stagingRoot)
    || path.dirname(path.resolve(transaction.backupPath)) !== path.resolve(backupRoot)
    || !path.basename(transaction.stagingPath).startsWith(`${transaction.pid}-`)
    || path.basename(transaction.backupPath) !== `${transaction.targetName}-${transaction.id}`
    || !isPathInside(stagingRoot, transaction.stagingPath)
    || !isPathInside(backupRoot, transaction.backupPath)
  ) {
    return false
  }

  let stagingRootStat: Awaited<ReturnType<typeof fs.lstat>>
  let backupRootStat: Awaited<ReturnType<typeof fs.lstat>>
  try {
    stagingRootStat = await fs.lstat(stagingRoot)
    backupRootStat = await fs.lstat(backupRoot)
    if (
      !stagingRootStat.isDirectory() || stagingRootStat.isSymbolicLink()
      || !backupRootStat.isDirectory() || backupRootStat.isSymbolicLink()
    ) {
      return false
    }
    const [canonicalStagingRoot, canonicalBackupRoot] = await Promise.all([
      fs.realpath(stagingRoot),
      fs.realpath(backupRoot)
    ])
    const [canonicalStagingParent, canonicalBackupParent] = await Promise.all([
      fs.realpath(path.dirname(transaction.stagingPath)),
      fs.realpath(path.dirname(transaction.backupPath))
    ])
    const canonicalRoot = await fs.realpath(root)
    if (
      !isPathWithin(canonicalStagingParent, canonicalStagingRoot)
      || !isPathWithin(canonicalBackupParent, canonicalBackupRoot)
      || !isPathWithin(canonicalStagingRoot, canonicalRoot)
      || !isPathWithin(canonicalBackupRoot, canonicalRoot)
    ) {
      return false
    }
    const [stagingStat, backupStat] = await Promise.all([
      readLstat(transaction.stagingPath),
      readLstat(transaction.backupPath)
    ])
    if (
      (stagingStat && (!stagingStat.isDirectory() || stagingStat.isSymbolicLink()))
      || (backupStat && (!backupStat.isDirectory() || backupStat.isSymbolicLink()))
    ) {
      return false
    }
    const targetStat = await readLstat(transaction.targetPath)
    if (targetStat?.isSymbolicLink()) {
      return false
    }
    if (stagingStat && !isPathWithin(await fs.realpath(transaction.stagingPath), canonicalStagingRoot)) {
      return false
    }
    if (backupStat && !isPathWithin(await fs.realpath(transaction.backupPath), canonicalBackupRoot)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

const recoverTransaction = async (
  root: string,
  transaction: SkillInstallTransaction,
  recordPath: string
): Promise<void> => {
  const targetStat = await readLstat(transaction.targetPath)
  const backupStat = await readLstat(transaction.backupPath)
  const stagingStat = await readLstat(transaction.stagingPath)
  const targetInspection = targetStat
    ? await inspectSkillDirectory(transaction.targetPath)
    : { state: 'incomplete' as const }

  if (targetInspection.state === 'unreadable') {
    throw targetInspection.error
  }
  const targetIsComplete = targetInspection.state === 'complete'

  if (targetIsComplete) {
    if (!transaction.preserveBackup && backupStat) {
      await fs.rm(transaction.backupPath, { recursive: true, force: true })
    }
    if (stagingStat) {
      await removeSkillStagingDirectory(transaction.stagingPath)
    }
    await fs.rm(recordPath, { force: true })
    return
  }

  if (backupStat) {
    if (targetStat) {
      const candidateBackup = path.join(
        root,
        SKILL_BACKUP_DIRECTORY,
        `${transaction.targetName}-failed-${transaction.id}`
      )
      await fs.rename(transaction.targetPath, candidateBackup)
    }
    await fs.rename(transaction.backupPath, transaction.targetPath)
    if (transaction.preserveBackup) {
      await fs.cp(transaction.targetPath, transaction.backupPath, {
        recursive: true,
        dereference: false,
        verbatimSymlinks: true
      })
    }
    if (stagingStat) {
      await removeSkillStagingDirectory(transaction.stagingPath)
    }
    await fs.rm(recordPath, { force: true })
    return
  }

  if (!targetStat && stagingStat) {
    const stagingInspection = await inspectSkillDirectory(transaction.stagingPath)
    if (stagingInspection.state === 'unreadable') {
      throw stagingInspection.error
    }
    if (stagingInspection.state !== 'complete') {
      return
    }
    await validateStagedSkillTree(transaction.stagingPath)
    await fs.rename(transaction.stagingPath, transaction.targetPath)
    await fs.rm(recordPath, { force: true })
    return
  }

  if (!targetStat && !stagingStat) {
    await fs.rm(recordPath, { force: true })
  }
}

export const recoverSkillInstallTransactions = async (root: string): Promise<void> => {
  const transactionRoot = path.join(root, SKILL_TRANSACTION_DIRECTORY)
  let entries: Dirent[]
  try {
    const stat = await fs.lstat(transactionRoot)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      return
    }
    entries = await fs.readdir(transactionRoot, { withFileTypes: true })
  } catch (error) {
    if (isMissingPathError(error)) {
      return
    }
    console.error('[SkillService] Failed to read skill install transactions:', error)
    return
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }

    const recordPath = path.join(transactionRoot, entry.name)
    let transaction: SkillInstallTransaction | null
    try {
      transaction = parseTransaction(await fs.readFile(recordPath, 'utf-8'))
    } catch {
      continue
    }
    if (!transaction || !(await isSafeTransaction(root, transaction, recordPath))) {
      continue
    }

    if (getProcessState(transaction.pid) !== 'stale') {
      continue
    }

    try {
      await recoverTransaction(root, transaction, recordPath)
    } catch (error) {
      console.error('[SkillService] Failed to recover skill install transaction:', recordPath, error)
    }
  }
}

export const validateStagedSkillTree = async (stagingPath: string): Promise<void> => {
  const canonicalRoot = await fs.realpath(stagingPath)
  const queue = [stagingPath]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isSymbolicLink()) {
        let canonicalPath: string
        try {
          canonicalPath = await fs.realpath(entryPath)
        } catch {
          throw new Error(`Skill link target cannot be resolved: ${entryPath}`)
        }
        if (!isPathWithin(canonicalPath, canonicalRoot)) {
          throw new Error(`Skill link escapes staging directory: ${entryPath}`)
        }
        continue
      }
      if (entry.isDirectory()) {
        queue.push(entryPath)
      }
    }
  }
}
