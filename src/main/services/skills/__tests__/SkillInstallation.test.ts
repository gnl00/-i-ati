import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
import * as fs from 'node:fs/promises'
import { SkillService } from '../SkillService'
import {
  createSkillInstallTransaction,
  createSkillStagingDirectory,
  recoverSkillInstallTransactions,
  updateSkillInstallTransaction,
  withSkillRootLock,
  SKILL_BACKUP_DIRECTORY,
  SKILL_STAGING_DIRECTORY,
  SKILL_TRANSACTION_DIRECTORY
} from '../SkillInstallation'

const state = vi.hoisted(() => ({
  userData: '',
  failPublish: false,
  destination: ''
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => state.userData)
  }
}))

vi.mock('@main/db/config', () => ({
  configDb: {
    isReady: vi.fn(() => false),
    getConfigValue: vi.fn(),
    saveConfigValue: vi.fn()
  }
}))

vi.mock('fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>): Promise<void> => {
      if (state.failPublish && String(args[1]) === state.destination) {
        state.failPublish = false
        throw Object.assign(new Error('Injected publish rename failure'), { code: 'EIO' })
      }
      await actual.rename(...args)
    }
  }
})

const skillContent = (name: string, body: string): string => [
  '---',
  `name: ${name}`,
  'description: Installation test skill.',
  '---',
  body
].join('\n')

const writeSkill = async (directory: string, name: string, body: string): Promise<void> => {
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'SKILL.md'), skillContent(name, body), 'utf-8')
}

describe('SkillInstallation', () => {
  beforeEach(async () => {
    state.userData = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-installation-test-'))
    state.failPublish = false
    state.destination = ''
  })

  afterEach(async () => {
    await fs.rm(state.userData, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('restores the previous version when the candidate publish rename fails', async () => {
    const source = path.join(state.userData, 'source', 'rollback-skill')
    await writeSkill(source, 'rollback-skill', 'old')
    await SkillService.loadSkill({ source })
    await writeSkill(source, 'rollback-skill', 'new')

    state.destination = path.join(state.userData, 'skills', 'rollback-skill')
    state.failPublish = true
    await expect(SkillService.loadSkill({ source, allowOverwrite: true }))
      .rejects.toThrow('Injected publish rename failure')

    await expect(SkillService.getSkillContent('rollback-skill')).resolves.toContain('old')
    const transactionEntries = await fs.readdir(
      path.join(state.userData, 'skills', SKILL_TRANSACTION_DIRECTORY),
      { withFileTypes: true }
    )
    expect(transactionEntries.filter(entry => entry.isFile() && entry.name.endsWith('.json')))
      .toHaveLength(0)
  })

  it('recovers an interrupted previous-moved transaction from its backup', async () => {
    const root = path.join(state.userData, 'skills')
    const targetName = 'legacy-skill'
    const stalePid = 99_999_999
    const stagingRoot = path.join(root, SKILL_STAGING_DIRECTORY)
    await fs.mkdir(stagingRoot, { recursive: true })
    const staging = path.join(stagingRoot, `${stalePid}-${randomUUID()}-fixture`)
    await writeSkill(staging, targetName, 'candidate')

    const target = path.join(root, targetName)
    await writeSkill(target, targetName, 'previous')
    const transaction = await createSkillInstallTransaction(root, targetName, staging)
    transaction.pid = stalePid
    await fs.rename(target, transaction.backupPath)
    await updateSkillInstallTransaction(root, transaction, 'previous-moved')

    await recoverSkillInstallTransactions(root)

    await expect(fs.readFile(path.join(target, 'SKILL.md'), 'utf-8')).resolves.toContain('previous')
    await expect(fs.access(transaction.backupPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.access(staging)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.access(path.join(root, SKILL_TRANSACTION_DIRECTORY, `${transaction.id}.json`))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps an active transaction and its backup untouched', async () => {
    const root = path.join(state.userData, 'skills')
    const targetName = 'active-skill'
    const staging = await createSkillStagingDirectory(root)
    await writeSkill(staging, targetName, 'candidate')
    const target = path.join(root, targetName)
    await writeSkill(target, targetName, 'previous')
    const transaction = await createSkillInstallTransaction(root, targetName, staging)
    await fs.rename(target, transaction.backupPath)
    await updateSkillInstallTransaction(root, transaction, 'previous-moved')

    await recoverSkillInstallTransactions(root)

    await expect(fs.access(target)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.access(transaction.backupPath)).resolves.toBeUndefined()
    await expect(fs.access(staging)).resolves.toBeUndefined()
    await expect(
      fs.access(path.join(root, SKILL_TRANSACTION_DIRECTORY, `${transaction.id}.json`))
    ).resolves.toBeUndefined()
  })

  it('ignores a transaction whose paths are not direct children of reserved roots', async () => {
    const root = path.join(state.userData, 'skills')
    const transactionRoot = path.join(root, SKILL_TRANSACTION_DIRECTORY)
    const stagingRoot = path.join(root, SKILL_STAGING_DIRECTORY)
    const backupRoot = path.join(root, SKILL_BACKUP_DIRECTORY)
    const outside = path.join(state.userData, 'outside')
    await Promise.all([
      fs.mkdir(transactionRoot, { recursive: true }),
      fs.mkdir(stagingRoot, { recursive: true }),
      fs.mkdir(backupRoot, { recursive: true }),
      fs.mkdir(outside, { recursive: true })
    ])
    const id = '123e4567-e89b-42d3-a456-426614174000'
    const recordPath = path.join(transactionRoot, `${id}.json`)
    await fs.writeFile(recordPath, JSON.stringify({
      version: 1,
      id,
      pid: 99_999_999,
      state: 'previous-moved',
      targetName: 'unsafe-skill',
      targetPath: path.join(root, 'unsafe-skill'),
      stagingPath: stagingRoot,
      backupPath: outside,
      createdAt: Date.now()
    }), 'utf-8')
    await fs.writeFile(path.join(outside, 'sentinel'), 'keep', 'utf-8')

    await recoverSkillInstallTransactions(root)

    await expect(fs.access(recordPath)).resolves.toBeUndefined()
    await expect(fs.readFile(path.join(outside, 'sentinel'), 'utf-8')).resolves.toBe('keep')
  })

  it('fails fast for a contended root and releases the lock after rejection', async () => {
    const root = path.join(state.userData, 'skills')
    await fs.mkdir(root, { recursive: true })
    let enteredResolve: (() => void) | undefined
    let releaseResolve: (() => void) | undefined
    const entered = new Promise<void>(resolve => { enteredResolve = resolve })
    const release = new Promise<void>(resolve => { releaseResolve = resolve })
    const first = withSkillRootLock(root, async () => {
      enteredResolve?.()
      await release
    })

    await entered
    await expect(withSkillRootLock(root, async () => undefined))
      .rejects.toThrow('Skill root is busy')
    releaseResolve?.()
    await first

    await expect(withSkillRootLock(root, async () => {
      throw new Error('operation rejected')
    })).rejects.toThrow('operation rejected')
    await expect(withSkillRootLock(root, async () => 'usable')).resolves.toBe('usable')
  })
})
