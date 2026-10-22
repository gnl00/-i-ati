import { beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import {
  DB_CONFIG_SAVE,
  SKILL_REFRESH_ACTION,
  SKILL_SCAN_RESULT_ACTION
} from '@shared/constants'

type Handler = (...args: never[]) => unknown
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  previous: { skills: { folders: ['/first'] } },
  save: vi.fn(),
  scan: vi.fn(),
  refresh: vi.fn(),
  result: vi.fn(),
  reveal: vi.fn(),
  root: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      mocks.handlers.set(channel, handler)
    }
  },
  shell: { showItemInFolder: mocks.reveal }
}))
vi.mock('@main/db/config', () => ({
  configDb: {
    getConfig: (): object => mocks.previous,
    saveConfig: mocks.save,
    initConfig: vi.fn()
  }
}))
vi.mock('@main/services/skills/SkillService', () => ({
  SkillService: {
    initializeFromConfig: mocks.scan,
    refresh: mocks.refresh,
    getScanResult: mocks.result,
    resolveSkillRootPath: mocks.root,
    listSkills: vi.fn(),
    getSkillContent: vi.fn()
  }
}))
vi.mock('@main/tools/skills/SkillToolsProcessor', () => ({
  processLoadSkill: vi.fn(),
  processReadSkillFile: vi.fn(),
  processUnloadSkill: vi.fn()
}))
vi.mock('@main/logging/LogService', () => ({
  createLogger: (): object => ({ info: vi.fn() })
}))
import { registerConfigHandlers } from '../config'
import { registerSkillHandlers } from '../skills'

const call = (channel: string, ...args: unknown[]): unknown =>
  mocks.handlers.get(channel)!(undefined as never, ...(args as never[]))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
  mocks.previous = { skills: { folders: ['/first'] } }
  mocks.scan.mockResolvedValue({ skills: [], issues: [] })
  registerConfigHandlers()
  registerSkillHandlers()
})

describe('source skill IPC', () => {
  it('retires filesystem mutation endpoints and exposes discovery', async () => {
    for (const channel of [
      'skill:install',
      'skill:import-folder',
      'skill:delete'
    ]) {
      expect(mocks.handlers.has(channel)).toBe(false)
    }
    await call(SKILL_REFRESH_ACTION)
    await call(SKILL_SCAN_RESULT_ACTION)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.result).toHaveBeenCalledOnce()
  })

  it('awaits source discovery after persisting changed folders', async () => {
    let finish: () => void = () => undefined
    mocks.scan.mockReturnValueOnce(
      new Promise<void>(resolve => {
        finish = resolve
      })
    )
    const config = { skills: { folders: ['/second'] } }
    const saving = call(DB_CONFIG_SAVE, config)
    let settled = false
    void Promise.resolve(saving).then(() => {
      settled = true
    })
    expect(mocks.save).toHaveBeenCalledWith(config)
    expect(mocks.scan).toHaveBeenCalledWith(config)
    await Promise.resolve()
    expect(settled).toBe(false)
    finish()
    await saving
    expect(settled).toBe(true)
  })

  it('skips scans for unrelated saves and does not scan on persistence failure', async () => {
    await call(DB_CONFIG_SAVE, mocks.previous)
    expect(mocks.scan).not.toHaveBeenCalled()
    mocks.save.mockImplementationOnce(() => {
      throw new Error('Storage unavailable')
    })
    await expect(
      call(DB_CONFIG_SAVE, { skills: { folders: [] } })
    ).rejects.toThrow('Storage unavailable')
    expect(mocks.scan).not.toHaveBeenCalled()
  })

  it('reveals the current source file rather than an installed copy', async () => {
    mocks.root.mockResolvedValue('/source/pdf')
    await call('skill:reveal-in-folder', { name: 'pdf' })
    expect(mocks.root).toHaveBeenCalledWith('pdf', { allowDisabled: true })
    expect(mocks.reveal).toHaveBeenCalledWith(path.join('/source/pdf', 'SKILL.md'))
  })
})

it('persists enablement changes without rescanning source folders', async () => {
  await call(DB_CONFIG_SAVE, { skills: { folders: ['/first'], disabledNames: ['pdf'] } })
  expect(mocks.save).toHaveBeenCalledWith({ skills: { folders: ['/first'], disabledNames: ['pdf'] } })
  expect(mocks.scan).not.toHaveBeenCalled()
})
