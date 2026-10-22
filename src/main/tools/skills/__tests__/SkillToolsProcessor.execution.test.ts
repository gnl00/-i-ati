import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { processRunSkillScript } from '../SkillToolsProcessor'
import { SkillService } from '@main/services/skills/SkillService'
import { waitForCommandProcessCleanup } from '@main/services/command/CommandProcessRunner'

const fixture = vi.hoisted(() => ({ root: '', workspace: '', skillRoot: '' }))

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: (): string => fixture.root } }))
vi.mock('@main/db/DatabaseService', () => ({
  default: { getWorkspacePathByUuid: (): string => fixture.workspace }
}))
vi.mock('@main/db/config', () => ({ configDb: { getConfig: (): object => ({}) } }))
vi.mock('@main/logging/LogService', () => ({
  createLogger: (): Record<string, ReturnType<typeof vi.fn>> => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()
  })
}))
vi.mock('@main/services/shellEnvironment', () => ({ ensureLoginShellPath: async (): Promise<void> => {} }))

const command = process.platform === 'win32'
  ? '"%SKILL_TEST_NODE%" "%SKILL_SCRIPT%"'
  : '"$SKILL_TEST_NODE" "$SKILL_SCRIPT"'

describe('skill script command execution', () => {
  beforeEach(async () => {
    fixture.root = await mkdtemp(join(tmpdir(), 'ati-skill-command-'))
    fixture.workspace = join(fixture.root, 'task workspace')
    fixture.skillRoot = join(fixture.root, 'source skill')
    await mkdir(fixture.workspace)
    await mkdir(join(fixture.skillRoot, 'scripts'), { recursive: true })
    await writeFile(join(fixture.workspace, 'input.txt'), 'task input')
    await writeFile(join(fixture.skillRoot, 'resource.txt'), 'skill resource')
    await writeFile(join(fixture.skillRoot, 'SKILL.md'), '---\nname: fixture\ndescription: Source execution fixture.\n---\nRun in place.')
    await SkillService.initializeFromConfig({ skills: { folders: [fixture.skillRoot] } } as IAppConfig)
  })

  afterEach(async () => {
    await waitForCommandProcessCleanup()
    await rm(fixture.root, { recursive: true, force: true })
  })

  const execute = (
    options: { cwd?: string; timeout?: number } = {}, context = {}
  ): ReturnType<typeof processRunSkillScript> =>
    processRunSkillScript({
      name: 'fixture', script: 'scripts/task.mjs', command,
      chat_uuid: 'fixture-chat', env: { SKILL_TEST_NODE: process.execPath }, ...options
    }, { metadataConfirmationApproved: true, ...context })

  it('executes a non-executable script in place with workspace input and output', async () => {
    const script = join(fixture.skillRoot, 'scripts/task.mjs')
    await writeFile(script, `
      import { readFileSync, writeFileSync } from 'node:fs'
      const resource = readFileSync(new URL('../resource.txt', import.meta.url), 'utf8')
      writeFileSync('output.txt', readFileSync('input.txt', 'utf8') + ' / ' + resource)
      console.log(JSON.stringify({ cwd: process.cwd(), script: process.env.SKILL_SCRIPT }))
    `)
    await chmod(script, 0o644)
    const onOutput = vi.fn()
    const setModelContent = vi.fn()

    const result = await execute({}, { onOutput, setModelContent })

    expect(result.success).toBe(true)
    const observation = JSON.parse(result.stdout ?? '')
    expect(observation.cwd).toBe(await realpath(fixture.workspace))
    expect(observation.script).toBe(result.script_path)
    expect(await readFile(join(fixture.workspace, 'output.txt'), 'utf8')).toBe('task input / skill resource')
    await expect(readFile(join(fixture.skillRoot, 'output.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(onOutput).toHaveBeenCalled()
    expect(setModelContent).toHaveBeenCalledOnce()
  })

  it('supports explicit cwd at the skill root', async () => {
    await writeFile(join(fixture.skillRoot, 'scripts/task.mjs'), `
      import { readFileSync } from 'node:fs'
      console.log(readFileSync('resource.txt', 'utf8'))
    `)

    const result = await execute({ cwd: fixture.skillRoot })

    expect(result.success).toBe(true)
    expect(result.stdout?.trim()).toBe('skill resource')
  })

  it('preserves nonzero exit, partial output and structured failure', async () => {
    await writeFile(join(fixture.skillRoot, 'scripts/task.mjs'), "console.log('partial'); process.exit(7)")

    const result = await execute()

    expect(result).toMatchObject({ success: false, exit_code: 7, failure: { code: 'COMMAND_NONZERO_EXIT' } })
    expect(result.stdout).toContain('partial')
  })

  it('applies the command timeout', async () => {
    await writeFile(join(fixture.skillRoot, 'scripts/task.mjs'), 'setInterval(() => {}, 1000)')

    const result = await execute({ timeout: 100 })

    expect(result).toMatchObject({ success: false, failure: { code: 'COMMAND_TIMEOUT' } })
  })

  it('propagates cancellation after the script starts', async () => {
    await writeFile(join(fixture.skillRoot, 'scripts/task.mjs'), "console.log('started'); setInterval(() => {}, 1000)")
    const controller = new AbortController()

    await expect(execute({}, {
      signal: controller.signal,
      onOutput: (): void => controller.abort()
    })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
