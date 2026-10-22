import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import os from 'os'
import * as fs from 'fs/promises'
import { SkillService } from '../SkillService'
import { configDb } from '@main/db/config'
import { SkillsPromptProvider } from '@main/hosts/chat/preparation/request/SkillsPromptProvider'
import { LoadedSkillsContextProvider } from '@main/hosts/chat/preparation/request/LoadedSkillsContextProvider'

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => userDataPath)
  }
}))

vi.mock('@main/db/chat', () => ({ chatDb: { getSkills: (): string[] => ['search-general'] } }))

vi.mock('@main/db/config', () => ({
  configDb: {
    getConfig: vi.fn(() => ({ skills: { folders: [] } }))
  }
}))

describe('SkillService', () => {
  beforeEach(async () => {
    vi.mocked(configDb.getConfig).mockReturnValue({ skills: { folders: [] } } as IAppConfig)
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'))
    await SkillService.initializeFromConfig({ skills: { folders: [] } } as IAppConfig)
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
    expect(content).toContain('use `web_fetch` when snippets leave gaps')
    expect(content).toContain('specific URL, read it with `web_fetch` first')
    expect(content).toContain('Reuse evidence already available')
    expect(content).toContain('each material side of a comparison')
    expect(content).toContain('Failure to find evidence is not proof')
    expect(content).toContain('respect returned wait guidance')
  })

  it('lists and reads the built-in project and frontend artifact skills', async () => {
    const list = await SkillService.listSkills()
    const projectContextSkill = list.find(item => item.name === 'project-context')
    const frontendArtifactSkill = list.find(item => item.name === 'frontend-artifact')

    expect(projectContextSkill).toMatchObject({
      name: 'project-context',
      source: 'built-in'
    })
    expect(projectContextSkill?.path).toBe(
      path.join(process.cwd(), 'resources', 'skills', 'project-context', 'SKILL.md')
    )
    expect(projectContextSkill?.description).toContain('repository architecture')

    expect(frontendArtifactSkill).toMatchObject({
      name: 'frontend-artifact',
      source: 'built-in'
    })
    expect(frontendArtifactSkill?.path).toBe(
      path.join(process.cwd(), 'resources', 'skills', 'frontend-artifact', 'SKILL.md')
    )
    expect(frontendArtifactSkill?.description).toContain('runnable frontend artifact')

    const [projectContextContent, frontendArtifactContent] = await Promise.all([
      SkillService.getSkillContent('project-context'),
      SkillService.getSkillContent('frontend-artifact')
    ])
    expect(projectContextContent).toContain('## Project Knowledge Routing')
    expect(projectContextContent).toContain('`.ati-kb/knowledge/api.md`')
    expect(frontendArtifactContent).toContain('## Aesthetic Direction')
    expect(frontendArtifactContent).toContain('`preview.sh`')
  })


  it('reads configured sources without creating or consulting installed copies', async () => {
    const source = path.join(userDataPath, 'source')
    const directory = path.join(source, 'original-name')
    await fs.mkdir(directory, { recursive: true })
    const file = path.join(directory, 'SKILL.md')
    const content = '---\nname: example\ndescription: Original description.\n---\nOriginal instructions.'
    await fs.writeFile(file, content)
    const legacy = path.join(userDataPath, 'skills', 'legacy')
    await fs.mkdir(legacy, { recursive: true })
    await fs.writeFile(path.join(legacy, 'SKILL.md'), '---\nname: legacy\ndescription: Old copy.\n---\nOld instructions.')
    const config = { skills: { folders: [source] } } as IAppConfig
    await SkillService.initializeFromConfig(config)
    expect((await SkillService.listSkills()).some(item => item.name === 'legacy')).toBe(false)
    await expect(SkillService.resolveSkillRootPath('example')).resolves.toBe(await fs.realpath(directory))
    await expect(SkillService.getSkillContent('example')).resolves.toBe(content)
    await expect(fs.stat(path.join(userDataPath, 'skills', 'example'))).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.writeFile(file, content.replace('Original description.', 'Updated description.'))
    expect((await SkillService.listSkills()).find(item => item.name === 'example')?.description).toBe('Original description.')
    await SkillService.initializeFromConfig(config)
    expect((await SkillService.listSkills()).find(item => item.name === 'example')?.description).toBe('Updated description.')
    // Restart/config initialization rebuilds the catalog from sources only.
    await SkillService.initializeFromConfig(config)
    await expect(SkillService.getSkillContent('example')).resolves.toContain('Updated description.')
    await SkillService.initializeFromConfig({ skills: { folders: [] } } as IAppConfig)
    await expect(SkillService.getSkillContent('example')).rejects.toThrow('not available')
    await expect(fs.readFile(file, 'utf8')).resolves.toContain('Updated description.')
  })

  it('awaits catalog initialization and gives the latest queued refresh precedence', async () => {
    const first = SkillService.initializeFromConfig({ skills: { folders: ['/missing-first-source'] } } as IAppConfig)
    const second = SkillService.initializeFromConfig({ skills: { folders: ['/missing-second-source'] } } as IAppConfig)
    const read = SkillService.listSkills()
    await Promise.all([first, second, read])
    const result = await SkillService.getScanResult()
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: '/missing-second-source' })]))
    expect(result.issues.some(issue => issue.path === '/missing-first-source')).toBe(false)
  })

  it('defaults to enabled and excludes disabled skills from both request contexts and new reads', async () => {
    expect((await SkillService.getScanResult()).skills.every(skill => skill.enabled)).toBe(true)
    vi.mocked(configDb.getConfig).mockReturnValue({ skills: { folders: [], disabledNames: ['search-general'] } } as IAppConfig)
    expect((await SkillService.listSkills()).some(skill => skill.name === 'search-general')).toBe(false)
    expect((await SkillService.getScanResult()).skills.find(skill => skill.name === 'search-general')?.enabled).toBe(false)
    expect(await new SkillsPromptProvider().build()).not.toContain('- search-general:')
    await expect(new LoadedSkillsContextProvider().build(9)).resolves.toBeNull()
    await expect(SkillService.getSkillContent('search-general')).rejects.toThrow('is disabled')
    await expect(SkillService.resolveSkillRootPath('search-general')).rejects.toThrow('is disabled')
    await expect(SkillService.resolveSkillRootPath('search-general', { allowDisabled: true })).resolves.toContain('search-general')
    // Catalog refresh/restart does not reset persisted availability.
    const refreshed = await SkillService.refresh()
    expect(refreshed.skills.find(skill => skill.name === 'search-general')?.enabled).toBe(false)
    expect((await SkillService.listSkills()).some(skill => skill.name === 'search-general')).toBe(false)
    vi.mocked(configDb.getConfig).mockReturnValue({ skills: { folders: [], disabledNames: [] } } as IAppConfig)
    expect(await new SkillsPromptProvider().build()).toContain('- search-general:')
    expect((await new LoadedSkillsContextProvider().build(9))?.content).toContain('search-general')
  })
})
