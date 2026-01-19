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
    getPath: vi.fn(() => userDataPath)
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

describe('SkillService', () => {
  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'))
  })

  afterEach(async () => {
    if (userDataPath) {
      await fs.rm(userDataPath, { recursive: true, force: true })
    }
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
