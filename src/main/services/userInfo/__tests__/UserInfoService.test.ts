import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UserInfoService } from '../UserInfoService'

const tempDirs: string[] = []

describe('UserInfoService', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))
    )
  })

  it('initializes a default user-info.md file when missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'user-info-service-'))
    tempDirs.push(dir)
    const service = new UserInfoService(() => dir)

    const record = await service.getUserInfo()

    expect(record.exists).toBe(false)
    expect(record.isEmpty).toBe(true)
    expect(record.info).toEqual({
      name: '',
      preferredAddress: '',
      basicInfo: '',
      preferences: '',
      updatedAt: 0
    })
    const content = await fs.readFile(path.join(dir, 'user-info.md'), 'utf-8')
    expect(content).toContain('preferredAddress')
  })

  it('persists and reloads a fully replaced profile', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'user-info-service-'))
    tempDirs.push(dir)
    const service = new UserInfoService(() => dir)

    const saved = await service.setUserInfo({
      name: 'Gn',
      preferredAddress: 'Gn',
      basicInfo: 'Creator of @i.',
      preferences: 'Prefers direct, low-fluff communication.'
    })

    expect(saved.isEmpty).toBe(false)
    expect(saved.info.name).toBe('Gn')
    expect(saved.info.updatedAt).toBeTypeOf('number')

    const reloaded = await service.getUserInfo()
    expect(reloaded.exists).toBe(true)
    expect(reloaded.info).toEqual(saved.info)
  })
})
