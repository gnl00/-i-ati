import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import * as fs from 'fs/promises'
import { spawnSync } from 'child_process'
import { SkillService } from '../SkillService'

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => userDataPath)
  }
}))

vi.mock('@main/db/config', () => ({
  configDb: {
    isReady: vi.fn(() => false),
    getConfigValue: vi.fn(),
    saveConfigValue: vi.fn()
  }
}))

const createSkillDir = async (rootDir: string, name: string): Promise<{ dir: string; content: string }> => {
  const dir = path.join(rootDir, name)
  await fs.mkdir(dir, { recursive: true })
  const content = [
    '---',
    `name: ${name}`,
    'description: Sample skill for tests.',
    '---',
    '',
    '# Sample',
    'Test content.'
  ].join('\n')
  await fs.writeFile(path.join(dir, 'SKILL.md'), content, 'utf-8')
  return { dir, content }
}

const hasCommand = (command: string): boolean => {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' })
  return result.status === 0
}

const hasArchiveTool = hasCommand('unzip') || hasCommand('tar')
const symlinkTest = process.platform === 'win32' ? it.skip : it

describe('SkillService', () => {
  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'))
  })

  afterEach(async () => {
    if (userDataPath) {
      await fs.rm(userDataPath, { recursive: true, force: true })
    }
  })

  it('lists the built-in search skill from resources', async () => {
    const list = await SkillService.listSkills()
    const searchSkill = list.find(item => item.name === 'search-general')

    expect(searchSkill).toMatchObject({
      name: 'search-general',
      source: 'built-in'
    })
    expect(searchSkill?.path).toBe(path.join(process.cwd(), 'resources', 'skills', 'search-general', 'SKILL.md'))
    expect(searchSkill?.description).toContain('any user request that asks to search')
    expect(searchSkill?.allowedTools).toEqual(['web_search', 'web_fetch'])

    const content = await SkillService.getSkillContent('search-general')
    expect(content).toContain('name: search-general')
    expect(content).toContain('## Trigger Conditions')
    expect(content).toContain('snippetsOnly: true')
  })

  it('lets an installed skill override a built-in skill with the same name', async () => {
    const sourcePath = path.join(userDataPath, 'search-skill.md')
    const content = [
      '---',
      'name: search-general',
      'description: User override skill.',
      '---',
      '',
      '# User Search'
    ].join('\n')
    await fs.writeFile(sourcePath, content, 'utf-8')

    await SkillService.loadSkill({ source: sourcePath })

    const list = await SkillService.listSkills()
    const searchSkill = list.find(item => item.name === 'search-general')
    expect(searchSkill?.description).toBe('User override skill.')

    const storedContent = await SkillService.getSkillContent('search-general')
    expect(storedContent).toContain('# User Search')
  })

  it('loads a skill from SKILL.md and supports list/get', async () => {
    const sourcePath = path.join(userDataPath, 'skill.md')
    const skillName = 'sample-skill'
    const content = [
      '---',
      `name: ${skillName}`,
      'description: Sample skill for tests.',
      '---',
      '',
      '# Sample',
      'Test content.'
    ].join('\n')
    await fs.writeFile(sourcePath, content, 'utf-8')

    const result = await SkillService.loadSkill({ source: sourcePath })
    expect(result.name).toBe(skillName)

    const list = await SkillService.listSkills()
    expect(list.map(item => item.name)).toContain(skillName)
    expect(list.find(item => item.name === skillName)?.path).toBe(
      path.join(userDataPath, 'skills', skillName, 'SKILL.md')
    )

    const storedContent = await SkillService.getSkillContent(skillName)
    expect(storedContent).toContain(`name: ${skillName}`)
    expect(storedContent).toContain('Test content.')
  })

  it('loads a skill from a directory and copies assets', async () => {
    const sourceBase = path.join(userDataPath, 'source')
    const { dir, content } = await createSkillDir(sourceBase, 'dir-skill')
    await fs.mkdir(path.join(dir, 'references'), { recursive: true })
    await fs.writeFile(path.join(dir, 'references', 'README.md'), 'ref', 'utf-8')

    const result = await SkillService.loadSkill({ source: dir })
    expect(result.name).toBe('dir-skill')

    const storedContent = await SkillService.getSkillContent('dir-skill')
    expect(storedContent).toBe(content)

    const referencePath = path.join(userDataPath, 'skills', 'dir-skill', 'references', 'README.md')
    expect(existsSync(referencePath)).toBe(true)
  })

  symlinkTest('accepts an internal SKILL.md symlink and reads its canonical target', async () => {
    const skillDir = path.join(userDataPath, 'skills', 'internal-link')
    await fs.mkdir(skillDir, { recursive: true })
    const content = [
      '---',
      'name: internal-link',
      'description: Internal linked skill.',
      '---',
      '',
      '# Internal Link'
    ].join('\n')
    await fs.writeFile(path.join(skillDir, 'skill-source.md'), content, 'utf-8')
    await fs.symlink('skill-source.md', path.join(skillDir, 'SKILL.md'))

    const installed = await SkillService.listInstalledSkills()
    expect(installed.find(skill => skill.name === 'internal-link')).toMatchObject({
      description: 'Internal linked skill.',
      path: path.join(skillDir, 'SKILL.md')
    })
    await expect(SkillService.getSkillContent('internal-link')).resolves.toBe(content)
  })

  symlinkTest('rejects an external SKILL.md symlink from metadata and content reads', async () => {
    const externalFile = path.join(userDataPath, 'external-skill.md')
    await fs.writeFile(
      externalFile,
      ['---', 'name: external-link', 'description: External.', '---', ''].join('\n'),
      'utf-8'
    )
    const skillDir = path.join(userDataPath, 'skills', 'external-link')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.symlink(externalFile, path.join(skillDir, 'SKILL.md'))

    const installed = await SkillService.listInstalledSkills()
    expect(installed.some(skill => skill.name === 'external-link')).toBe(false)
    await expect(SkillService.getSkillContent('external-link')).rejects.toThrow(
      'Skill file symlink escapes skill directory'
    )
  })

  symlinkTest('ignores dangling SKILL.md symlinks during metadata discovery', async () => {
    const skillDir = path.join(userDataPath, 'skills', 'dangling-link')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.symlink('missing.md', path.join(skillDir, 'SKILL.md'))

    const installed = await SkillService.listInstalledSkills()

    expect(installed.some(skill => skill.name === 'dangling-link')).toBe(false)
    await expect(SkillService.getSkillContent('dangling-link')).rejects.toThrow(
      'Skill "dangling-link" not found'
    )
  })

  symlinkTest('ignores external skill source metadata symlinks', async () => {
    const { dir } = await createSkillDir(
      path.join(userDataPath, 'skills'),
      'external-source-info'
    )
    const externalSourceInfo = path.join(userDataPath, 'external-source.json')
    await fs.writeFile(externalSourceInfo, JSON.stringify({ source: 'private-source' }), 'utf-8')
    await fs.symlink(externalSourceInfo, path.join(dir, '.skill-source.json'))

    const installed = await SkillService.listInstalledSkills()
    const skill = installed.find(item => item.name === 'external-source-info')

    expect(skill).toBeDefined()
    expect(skill?.source).toBeUndefined()
  })

  symlinkTest('replaces copied skill source symlinks without writing through them', async () => {
    const sourceBase = path.join(userDataPath, 'source-with-linked-metadata')
    const { dir } = await createSkillDir(sourceBase, 'linked-source-write')
    const externalSourceInfo = path.join(userDataPath, 'external-write-target.json')
    const sentinel = JSON.stringify({ source: 'preserve-me' })
    await fs.writeFile(externalSourceInfo, sentinel, 'utf-8')
    await fs.symlink(externalSourceInfo, path.join(dir, '.skill-source.json'))

    await SkillService.loadSkill({ source: dir })

    await expect(fs.readFile(externalSourceInfo, 'utf-8')).resolves.toBe(sentinel)
    const installedSourceInfo = path.join(
      userDataPath,
      'skills',
      'linked-source-write',
      '.skill-source.json'
    )
    expect((await fs.lstat(installedSourceInfo)).isSymbolicLink()).toBe(false)
    expect(JSON.parse(await fs.readFile(installedSourceInfo, 'utf-8')).source).toBe(dir)
  })

  it('imports skills from a folder and renames conflicts', async () => {
    const existingName = 'pdf-processing'
    const existingPath = path.join(userDataPath, 'existing-skill.md')
    await fs.writeFile(
      existingPath,
      ['---', `name: ${existingName}`, 'description: Existing.', '---', ''].join('\n'),
      'utf-8'
    )
    await SkillService.loadSkill({ source: existingPath })

    const importRoot = path.join(userDataPath, 'skill-source')
    await fs.mkdir(importRoot, { recursive: true })
    await createSkillDir(importRoot, existingName)
    await createSkillDir(importRoot, 'analysis-skill')

    const result = await SkillService.importSkillsFromFolder(importRoot)
    expect(result.installed.length).toBe(2)
    expect(result.renamed.length).toBe(1)

    const renamed = result.renamed[0]
    expect(renamed.from).toBe(existingName)
    expect(renamed.to).toBe(`${existingName}-skill-source`)

    const list = await SkillService.listSkills()
    const names = list.map(item => item.name)
    expect(names).toContain(existingName)
    expect(names).toContain(`${existingName}-skill-source`)
    expect(names).toContain('analysis-skill')
  })

  const testArchive = hasArchiveTool ? it : it.skip
  testArchive('loads a skill from a zip archive', async () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url))
    const archivePath = path.join(testDir, 'fixtures', 'pdf.zip')
    if (!existsSync(archivePath)) {
      throw new Error('Missing fixtures/pdf.zip. Please add it to the fixtures folder.')
    }

    const result = await SkillService.loadSkill({ source: archivePath })
    expect(result.name).toBeTruthy()

    const list = await SkillService.listSkills()
    expect(list.map(item => item.name)).toContain(result.name)

    const storedContent = await SkillService.getSkillContent(result.name)
    expect(storedContent).toContain(`name: ${result.name}`)
  })
})
