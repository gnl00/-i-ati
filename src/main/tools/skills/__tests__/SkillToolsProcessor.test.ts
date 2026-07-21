import { describe, expect, it, vi, beforeEach } from 'vitest'
import { existsSync } from 'fs'
import * as fs from 'fs/promises'
import {
  processLoadSkill,
  processReadSkillFile,
  processRunSkillScript,
  processUnloadSkill
} from '../SkillToolsProcessor'
import DatabaseService from '@main/db/DatabaseService'
import { SkillService } from '@main/services/skills/SkillService'
import { processExecuteCommand } from '@main/tools/command/CommandProcessor'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/user-data')
  }
}))

vi.mock('fs', () => ({
  existsSync: vi.fn()
}))

vi.mock('fs/promises', () => ({
  lstat: vi.fn(),
  realpath: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getChatByUuid: vi.fn(),
    getSkills: vi.fn(),
    addSkill: vi.fn(),
    removeSkill: vi.fn()
  }
}))

vi.mock('@main/services/skills/SkillService', () => ({
  SkillService: {
    getSkillContent: vi.fn(),
    resolveSkillRootPath: vi.fn()
  }
}))

vi.mock('@main/tools/command/CommandProcessor', () => ({
  processExecuteCommand: vi.fn()
}))

describe('SkillToolsProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => false } as never)
    vi.mocked(fs.realpath).mockImplementation(async value => String(value))
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => false } as any)
    vi.mocked(fs.readdir).mockResolvedValue([])
    vi.mocked(fs.readFile).mockResolvedValue('line 1\nline 2')
    vi.mocked(processExecuteCommand).mockResolvedValue({
      success: true,
      command: 'bun scripts/amap.ts --help',
      stdout: 'ok',
      stderr: '',
      exit_code: 0,
      execution_time: 12
    })
    vi.mocked(SkillService.getSkillContent).mockResolvedValue(
      '---\nname: pdf-processing\ndescription: Handle PDFs.\n---\nUse PDF workflow.'
    )
    vi.mocked(SkillService.resolveSkillRootPath).mockResolvedValue('/tmp/user-data/skills/amap')
  })

  it('fails when name is missing', async () => {
    const result = await processUnloadSkill({ name: '', chat_uuid: 'chat-1' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('name is required')
  })

  it('fails when chat_uuid is missing', async () => {
    const result = await processUnloadSkill({ name: 'pdf-processing' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('chat_uuid is required')
  })

  it('fails when chat is not found', async () => {
    vi.mocked(DatabaseService.getChatByUuid).mockReturnValue(undefined)
    const result = await processUnloadSkill({ name: 'pdf-processing', chat_uuid: 'chat-1' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('Chat not found')
  })

  it('removes skill when chat is found', async () => {
    vi.mocked(DatabaseService.getChatByUuid).mockReturnValue({ id: 1 } as ChatEntity)
    const result = await processUnloadSkill({ name: 'pdf-processing', chat_uuid: 'chat-1' })
    expect(result.success).toBe(true)
    expect(DatabaseService.removeSkill).toHaveBeenCalledWith(1, 'pdf-processing')
  })

  it('loads a skill when it is not already loaded for the chat', async () => {
    vi.mocked(DatabaseService.getChatByUuid).mockReturnValue({ id: 1 } as ChatEntity)
    vi.mocked(DatabaseService.getSkills).mockReturnValue(['frontend-design'])

    const result = await processLoadSkill({ name: 'pdf-processing', chat_uuid: 'chat-1' })

    expect(result).toMatchObject({
      success: true,
      name: 'pdf-processing',
      loaded: true,
      contextInjected: true
    })
    expect(result).not.toHaveProperty('content')
    expect(DatabaseService.getSkills).toHaveBeenCalledWith(1)
    expect(DatabaseService.addSkill).toHaveBeenCalledWith(1, 'pdf-processing')
    expect(SkillService.getSkillContent).toHaveBeenCalledWith('pdf-processing')
  })

  it('returns success without inserting when the skill is already loaded for the chat', async () => {
    vi.mocked(DatabaseService.getChatByUuid).mockReturnValue({ id: 1 } as ChatEntity)
    vi.mocked(DatabaseService.getSkills).mockReturnValue(['pdf-processing'])

    const result = await processLoadSkill({ name: 'pdf-processing', chat_uuid: 'chat-1' })

    expect(result).toMatchObject({
      success: true,
      name: 'pdf-processing',
      loaded: true,
      contextInjected: true,
      message: 'Skill already loaded in hidden skills context.'
    })
    expect(result).not.toHaveProperty('content')
    expect(DatabaseService.getSkills).toHaveBeenCalledWith(1)
    expect(DatabaseService.addSkill).toHaveBeenCalledTimes(0)
    expect(SkillService.getSkillContent).toHaveBeenCalledWith('pdf-processing')
  })

  it('lists entries when read_skill_file targets a directory', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any)
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'zeta.md', isDirectory: () => false, isFile: () => true },
      { name: 'scripts', isDirectory: () => true, isFile: () => false },
      { name: 'SKILL.md', isDirectory: () => false, isFile: () => true }
    ] as any)

    const result = await processReadSkillFile({ name: 'amap', path: '.' })

    expect(result).toMatchObject({
      success: true,
      skill_root: '/tmp/user-data/skills/amap',
      file_path: '.',
      absolute_path: '/tmp/user-data/skills/amap',
      total_entries: 3,
      truncated: false,
      entries: [
        { name: 'scripts', type: 'directory', path: 'scripts' },
        { name: 'SKILL.md', type: 'file', path: 'SKILL.md' },
        { name: 'zeta.md', type: 'file', path: 'zeta.md' }
      ]
    })
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('limits directory entries when max_entries is provided', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any)
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'scripts', isDirectory: () => true, isFile: () => false },
      { name: 'references', isDirectory: () => true, isFile: () => false },
      { name: 'SKILL.md', isDirectory: () => false, isFile: () => true }
    ] as any)

    const result = await processReadSkillFile({ name: 'amap', path: '.', max_entries: 2 })

    expect(result).toMatchObject({
      success: true,
      total_entries: 3,
      truncated: true,
      entries: [
        { name: 'references', type: 'directory', path: 'references' },
        { name: 'scripts', type: 'directory', path: 'scripts' }
      ]
    })
  })

  it('returns skill root metadata when reading a file', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('first\nsecond\nthird')

    const result = await processReadSkillFile({
      name: 'amap',
      path: 'references/examples.md',
      start_line: 2,
      end_line: 3
    })

    expect(result).toMatchObject({
      success: true,
      skill_root: '/tmp/user-data/skills/amap',
      file_path: 'references/examples.md',
      absolute_path: '/tmp/user-data/skills/amap/references/examples.md',
      content: 'second\nthird',
      lines: 3
    })
  })

  it('reads files from a built-in skill root', async () => {
    vi.mocked(SkillService.resolveSkillRootPath).mockResolvedValue(
      '/app/resources/skills/search-general'
    )

    const result = await processReadSkillFile({
      name: 'search-general',
      path: 'SKILL.md',
      start_line: 1,
      end_line: 2
    })

    expect(result).toMatchObject({
      success: true,
      skill_root: '/app/resources/skills/search-general',
      file_path: 'SKILL.md',
      absolute_path: '/app/resources/skills/search-general/SKILL.md',
      content: 'line 1\nline 2'
    })
  })

  it('rejects read_skill_file symlinks that resolve outside the skill root', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as never)
    vi.mocked(fs.realpath).mockImplementation(async value => {
      const target = String(value)
      return target.endsWith('/references/external.md') ? '/etc/external.md' : target
    })

    const result = await processReadSkillFile({
      name: 'amap',
      path: 'references/external.md'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('symlink escapes skill directory')
    expect(fs.readFile).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('rejects dangling read_skill_file symlinks', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as never)
    vi.mocked(fs.realpath).mockImplementation(async value => {
      if (String(value).endsWith('/references/dangling.md')) {
        throw Object.assign(new Error('missing target'), { code: 'ENOENT' })
      }
      return String(value)
    })

    const result = await processReadSkillFile({
      name: 'amap',
      path: 'references/dangling.md'
    })

    expect(result).toMatchObject({
      success: false,
      message: 'Path symlink target cannot be resolved: references/dangling.md'
    })
    expect(fs.readFile).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('reads internal read_skill_file symlinks through their canonical target', async () => {
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as never)
    vi.mocked(fs.realpath).mockImplementation(async value => {
      const target = String(value)
      return target.endsWith('/references/current.md')
        ? '/tmp/user-data/skills/amap/references/v2.md'
        : target
    })
    vi.mocked(fs.readFile).mockResolvedValue('internal content')

    const result = await processReadSkillFile({
      name: 'amap',
      path: 'references/current.md'
    })

    expect(fs.readFile).toHaveBeenCalledWith(
      '/tmp/user-data/skills/amap/references/v2.md',
      'utf-8'
    )
    expect(result).toMatchObject({
      success: true,
      absolute_path: '/tmp/user-data/skills/amap/references/current.md',
      content: 'internal content'
    })
  })

  it('runs a TypeScript skill script from the skill root', async () => {
    const result = await processRunSkillScript(
      {
        name: 'amap',
        script: 'scripts/amap.ts',
        args: ['geocode', '--address', "Bob's house"],
        env: { AMAP_MAPS_API_KEY: 'key' },
        timeout: 10000,
        chat_uuid: 'chat-1'
      },
      { metadataConfirmationApproved: true }
    )

    expect(SkillService.resolveSkillRootPath).toHaveBeenCalledWith('amap')
    expect(processExecuteCommand).toHaveBeenCalledWith(
      {
        command: "bun 'scripts/amap.ts' 'geocode' '--address' 'Bob'\\''s house'",
        cwd: '/tmp/user-data/skills/amap',
        timeout: 10000,
        env: { AMAP_MAPS_API_KEY: 'key' },
        execution_reason: 'Run skill script amap/scripts/amap.ts',
        possible_risk: 'Runs an available skill script with the working directory fixed to the skill root.',
        risk_score: 3,
        confirmed: true
      },
      { metadataConfirmationApproved: true },
      {
        executable: 'bun',
        args: [
          '/tmp/user-data/skills/amap/scripts/amap.ts',
          'geocode',
          '--address',
          "Bob's house"
        ]
      }
    )
    expect(result).toMatchObject({
      success: true,
      skill_root: '/tmp/user-data/skills/amap',
      script_path: '/tmp/user-data/skills/amap/scripts/amap.ts',
      stdout: 'ok'
    })
  })

  it('forwards the embedded execution context to skill script commands', async () => {
    const controller = new AbortController()
    const onOutput = vi.fn()
    const context = {
      signal: controller.signal,
      onOutput,
      metadataConfirmationApproved: true
    }

    await processRunSkillScript({
      name: 'amap',
      script: 'scripts/amap.ts'
    }, context)

    expect(processExecuteCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "bun 'scripts/amap.ts'",
        confirmed: true
      }),
      context,
      {
        executable: 'bun',
        args: ['/tmp/user-data/skills/amap/scripts/amap.ts']
      }
    )
  })

  it('does not trust model arguments or direct processor calls as confirmation', async () => {
    await processRunSkillScript({
      name: 'amap',
      script: 'scripts/amap.ts',
      confirmed: true
    } as never)

    expect(processExecuteCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmed: false
      }),
      undefined,
      expect.any(Object)
    )
  })

  it('rejects script paths that escape the skill directory', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await processRunSkillScript({
      name: 'amap',
      script: '../outside.sh'
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('escapes skill directory')
    expect(processExecuteCommand).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('rejects skill script symlinks that resolve outside the skill root', async () => {
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as never)
    vi.mocked(fs.realpath).mockImplementation(async value => {
      const target = String(value)
      return target.endsWith('/scripts/external.sh') ? '/etc/external.sh' : target
    })

    const result = await processRunSkillScript({
      name: 'amap',
      script: 'scripts/external.sh'
    })

    expect(result).toMatchObject({
      success: false,
      skill_root: '/tmp/user-data/skills/amap',
      script_path: '/tmp/user-data/skills/amap/scripts/external.sh'
    })
    expect(result.error).toContain('symlink escapes skill directory')
    expect(processExecuteCommand).not.toHaveBeenCalled()
  })

  it('rejects dangling skill script symlinks', async () => {
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as never)
    vi.mocked(fs.realpath).mockImplementation(async value => {
      if (String(value).endsWith('/scripts/dangling.sh')) {
        throw Object.assign(new Error('missing target'), { code: 'ENOENT' })
      }
      return String(value)
    })

    const result = await processRunSkillScript({
      name: 'amap',
      script: 'scripts/dangling.sh'
    })

    expect(result).toMatchObject({
      success: false,
      skill_root: '/tmp/user-data/skills/amap',
      script_path: '/tmp/user-data/skills/amap/scripts/dangling.sh',
      error: 'Script symlink target cannot be resolved: scripts/dangling.sh'
    })
    expect(processExecuteCommand).not.toHaveBeenCalled()
  })

  it('runs an internal skill script symlink through its canonical target', async () => {
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as never)
    vi.mocked(fs.realpath).mockImplementation(async value => {
      const target = String(value)
      return target.endsWith('/scripts/current.sh')
        ? '/tmp/user-data/skills/amap/scripts/v2.ts'
        : target
    })

    const result = await processRunSkillScript(
      {
        name: 'amap',
        script: 'scripts/current.sh'
      },
      { metadataConfirmationApproved: true }
    )

    expect(processExecuteCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "bun 'scripts/current.sh'",
        cwd: '/tmp/user-data/skills/amap',
        confirmed: true
      }),
      expect.objectContaining({ metadataConfirmationApproved: true }),
      {
        executable: 'bun',
        args: ['/tmp/user-data/skills/amap/scripts/v2.ts']
      }
    )
    expect(result.script_path).toBe('/tmp/user-data/skills/amap/scripts/v2.ts')
  })

  it('rejects directory script paths', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any)

    const result = await processRunSkillScript({
      name: 'amap',
      script: 'scripts'
    })

    expect(result).toMatchObject({
      success: false,
      skill_root: '/tmp/user-data/skills/amap',
      script_path: '/tmp/user-data/skills/amap/scripts',
      error: 'Script path is a directory: scripts'
    })
    expect(processExecuteCommand).not.toHaveBeenCalled()
  })
})
