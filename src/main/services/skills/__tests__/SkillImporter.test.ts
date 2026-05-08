import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import os from 'os'
import * as fs from 'fs/promises'
import { importSkillsFromFolder } from '../SkillImporter'
import { installSkillFromDirectory } from '../SkillInstaller'
import { findSkillDirectories } from '../SkillCollector'
import { markSkillCacheDirty } from '../SkillCache'

vi.mock('../SkillCache', () => ({
  ensureSkillsDir: vi.fn(async () => '/tmp/skills-root'),
  markSkillCacheDirty: vi.fn()
}))

vi.mock('../SkillCollector', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../SkillCollector')>()
  return {
    ...actual,
    findSkillDirectories: vi.fn()
  }
})

vi.mock('../SkillInstaller', () => ({
  installSkillFromDirectory: vi.fn(async (
    _sourceDir: string,
    _args: unknown,
    _root: string,
    _allowOverwrite: boolean,
    sourceLabel: string,
    overrideName: string
  ) => ({
    name: overrideName,
    frontmatterName: overrideName,
    description: 'Installed skill.',
    source: sourceLabel
  }))
}))

let tempDir = ''

const createSkillDir = async (rootDir: string, name: string): Promise<string> => {
  const dir = path.join(rootDir, name)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    ['---', `name: ${name}`, 'description: Imported skill.', '---', ''].join('\n'),
    'utf-8'
  )
  return dir
}

describe('SkillImporter', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-importer-test-'))
  })

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('renames imported skills when the normalized name already exists', async () => {
    const importRoot = path.join(tempDir, 'skill-source')
    const sourceDir = await createSkillDir(importRoot, 'pdf-processing')
    vi.mocked(findSkillDirectories).mockResolvedValue([sourceDir])

    const result = await importSkillsFromFolder(importRoot, async () => [
      {
        name: 'pdf-processing',
        description: 'Existing skill.'
      }
    ])

    expect(result.failed).toEqual([])
    expect(result.renamed).toEqual([
      { from: 'pdf-processing', to: 'pdf-processing-skill-source' }
    ])
    expect(result.installed.map(skill => skill.name)).toEqual(['pdf-processing-skill-source'])
    expect(installSkillFromDirectory).toHaveBeenCalledWith(
      sourceDir,
      { source: sourceDir },
      '/tmp/skills-root',
      false,
      path.resolve(sourceDir),
      'pdf-processing-skill-source'
    )
    expect(markSkillCacheDirty).toHaveBeenCalledTimes(1)
  })
})
