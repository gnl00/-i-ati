import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { SkillService } from '../SkillService'
import { createSkillInstallTransaction, createSkillStagingDirectory, withSkillRootLock } from '../SkillInstallation'

const state = vi.hoisted(() => ({ userData: '', failNextCopy: false }))

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: (): string => state.userData }
}))

vi.mock('@main/db/config', () => ({
  configDb: { isReady: (): boolean => false }
}))

vi.mock('fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    cp: async (...args: Parameters<typeof actual.cp>): Promise<void> => {
      if (state.failNextCopy) {
        state.failNextCopy = false
        await actual.mkdir(args[1], { recursive: true })
        await actual.writeFile(path.join(String(args[1]), 'partial-copy.txt'), 'partial')
        throw Object.assign(new Error('Injected copy failure'), { code: 'EIO' })
      }
      await actual.cp(...args)
    }
  }
})

const writeSource = async (folder: string, name: string, body = 'Complete content'): Promise<string> => {
  const root = path.join(state.userData, folder, name)
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(
    path.join(root, 'SKILL.md'),
    ['---', `name: ${name}`, 'description: Recovery integration fixture.', '---', body].join('\n')
  )
  return root
}

const findFile = async (root: string, name: string): Promise<string[]> => {
  const results: string[] = []
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) results.push(...await findFile(file, name))
    else if (entry.isFile() && entry.name === name) results.push(file)
  }
  return results
}

describe('Skill recovery through public service entry points', () => {
  beforeEach(async () => {
    state.userData = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-recovery-flow-'))
    state.failNextCopy = false
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await fs.rm(state.userData, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('recovers a partial install, preserves its files, and allows the next import', async () => {
    const source = await writeSource('source', 'pdf')
    await fs.mkdir(path.join(source, 'scripts'))
    await fs.writeFile(path.join(source, 'scripts', 'example.py'), 'print("complete")')
    const installed = path.join(state.userData, 'skills', 'pdf')
    await fs.mkdir(installed, { recursive: true })
    await fs.writeFile(path.join(installed, 'user-original.txt'), 'preserve this partial install')

    const first = await SkillService.importSkillsFromFolder(source)
    const second = await SkillService.importSkillsFromFolder(source)

    expect(first.failed).toEqual([])
    expect(first.installed.map(skill => skill.name)).toEqual(['pdf'])
    expect(second.failed).toEqual([])
    expect(second.installed.map(skill => skill.name)).toEqual(['pdf'])
    expect((await SkillService.listInstalledSkills()).map(skill => skill.name)).toEqual(['pdf'])
    await expect(fs.readFile(path.join(installed, 'scripts', 'example.py'), 'utf-8'))
      .resolves.toBe('print("complete")')
    const backups = await findFile(path.join(state.userData, 'skills'), 'user-original.txt')
    expect(backups).toHaveLength(1)
    expect(backups[0]).not.toBe(path.join(installed, 'user-original.txt'))
    await expect(fs.readFile(backups[0], 'utf-8')).resolves.toBe('preserve this partial install')
    const metadata = JSON.parse(await fs.readFile(path.join(installed, '.skill-source.json'), 'utf-8'))
    expect(metadata.source).toBe(source)
  })

  it('keeps the old installation readable when copying an update fails', async () => {
    const source = await writeSource('source', 'stable', 'Old complete content')
    await SkillService.loadSkill({ source })
    const original = await SkillService.getSkillContent('stable')
    await writeSource('source', 'stable', 'New content')
    state.failNextCopy = true

    await expect(SkillService.loadSkill({ source, allowOverwrite: true }))
      .rejects.toThrow('Injected copy failure')

    await expect(SkillService.getSkillContent('stable')).resolves.toBe(original)
    await expect(fs.access(path.join(state.userData, 'skills', 'stable', 'partial-copy.txt')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    await expect(SkillService.loadSkill({ source, allowOverwrite: true }))
      .resolves.toMatchObject({ name: 'stable' })
  })

  it('preserves a partial installation belonging to a different source', async () => {
    const source = await writeSource('incoming', 'pdf')
    const installed = path.join(state.userData, 'skills', 'pdf')
    await fs.mkdir(installed, { recursive: true })
    const foreignSource = path.join(state.userData, 'another-source', 'pdf')
    await fs.writeFile(path.join(installed, '.skill-source.json'), JSON.stringify({ source: foreignSource }))
    await fs.writeFile(path.join(installed, 'user-original.txt'), 'foreign partial data')

    const result = await SkillService.importSkillsFromFolder(source)

    expect(result.failed).toEqual([])
    expect(result.installed.map(skill => skill.name)).toEqual(['pdf-pdf'])
    await expect(fs.readFile(path.join(installed, 'user-original.txt'), 'utf-8'))
      .resolves.toBe('foreign partial data')
    expect(JSON.parse(await fs.readFile(path.join(installed, '.skill-source.json'), 'utf-8')).source)
      .toBe(foreignSource)
  })

  it('reports a failed skill and continues importing the next configured source', async () => {
    const badSource = await writeSource('bad-source', 'bad')
    await fs.writeFile(path.join(badSource, 'SKILL.md'), 'invalid frontmatter')
    const goodSource = await writeSource('good-source', 'good')

    await SkillService.initializeFromConfig({
      skills: { folders: [badSource, goodSource] }
    } as IAppConfig)

    expect((await SkillService.listInstalledSkills()).map(skill => skill.name)).toEqual(['good'])
    const errorLog = vi.mocked(console.error).mock.calls.map(args => args.map(String).join(' ')).join('\n')
    expect(errorLog).toContain(badSource)
    expect(errorLog).toContain('SKILL.md must start with YAML frontmatter')
  })

  it('restores an interrupted replacement on startup with no import folders', async () => {
    const original = await writeSource('skills', 'interrupted', 'Old complete content')
    const root = path.join(state.userData, 'skills')
    const staging = await createSkillStagingDirectory(root)
    const candidate = await writeSource('candidate', 'interrupted', 'New content')
    await fs.cp(candidate, staging, { recursive: true })
    const transaction = await createSkillInstallTransaction(root, 'interrupted', staging)
    await fs.rename(original, transaction.backupPath)
    // A process can exit after moving the directory and before updating its record.
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('Previous process exited'), { code: 'ESRCH' })
    })

    await SkillService.initializeFromConfig()

    await expect(SkillService.getSkillContent('interrupted')).resolves.toContain('Old complete content')
    await expect(fs.access(staging)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
  })

  it('lets one contender reclaim a stale lock while preserving mutual exclusion', async () => {
    const root = path.join(state.userData, 'skills')
    const lock = path.join(root, '.skill-lock')
    await fs.mkdir(lock, { recursive: true })
    await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: 99_999_999, token: 'old' }))
    let active = 0
    let release = (): void => undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const attempt = (): Promise<void> => withSkillRootLock(root, async () => {
      active += 1
      expect(active).toBe(1)
      await gate
      active -= 1
    }).catch((error: unknown) => {
      release()
      throw error
    })

    const results = await Promise.allSettled([attempt(), attempt()])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const failure = results.find(result => result.status === 'rejected')
    expect(failure?.status === 'rejected' ? String(failure.reason) : '').toContain('Skill root is busy')
    await expect(withSkillRootLock(root, async () => 'available')).resolves.toBe('available')
  })

  it.skipIf(process.platform === 'win32')('protects an incomplete install with an unsafe source record', async () => {
    const source = await writeSource('incoming', 'pdf')
    const installed = path.join(state.userData, 'skills', 'pdf')
    await fs.mkdir(installed, { recursive: true })
    const record = path.join(state.userData, 'external-source.json')
    await fs.writeFile(record, JSON.stringify({ source }))
    await fs.symlink(record, path.join(installed, '.skill-source.json'))
    await fs.writeFile(path.join(installed, 'user-original.txt'), 'protected partial data')

    const result = await SkillService.importSkillsFromFolder(source)

    expect(result.installed).toEqual([])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].error).toContain('cannot be safely inspected')
    await expect(fs.readFile(path.join(installed, 'user-original.txt'), 'utf-8'))
      .resolves.toBe('protected partial data')
    expect((await fs.lstat(path.join(installed, '.skill-source.json'))).isSymbolicLink()).toBe(true)
  })

  it.skipIf(process.platform === 'win32')('preserves a source-relative SKILL.md link through installation', async () => {
    const source = await writeSource('source', 'linked-entry', 'Linked complete content')
    await fs.rename(path.join(source, 'SKILL.md'), path.join(source, 'entry.md'))
    await fs.symlink('entry.md', path.join(source, 'SKILL.md'))

    await SkillService.loadSkill({ source })

    await expect(SkillService.getSkillContent('linked-entry')).resolves.toContain('Linked complete content')
    const installed = path.join(state.userData, 'skills', 'linked-entry')
    expect(await fs.realpath(path.join(installed, 'SKILL.md')))
      .toBe(await fs.realpath(path.join(installed, 'entry.md')))
  })

  it.skipIf(process.platform === 'win32')('keeps source permissions when validating an absolute entry link', async () => {
    const source = await writeSource('source', 'absolute-entry')
    const entry = path.join(source, 'entry.md')
    await fs.rename(path.join(source, 'SKILL.md'), entry)
    await fs.chmod(source, 0o755)
    await fs.chmod(entry, 0o640)
    await fs.symlink(entry, path.join(source, 'SKILL.md'))

    await Promise.allSettled([SkillService.loadSkill({ source })])

    expect((await fs.stat(entry)).mode & 0o777).toBe(0o640)
    await expect(fs.readFile(entry, 'utf-8')).resolves.toContain('Complete content')
  })
})
