import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getUserInfoMock,
  setUserInfoMock
} = vi.hoisted(() => ({
  getUserInfoMock: vi.fn(),
  setUserInfoMock: vi.fn()
}))

vi.mock('@main/services/userInfo/UserInfoService', () => ({
  default: {
    getUserInfo: getUserInfoMock,
    setUserInfo: setUserInfoMock
  }
}))

import {
  processUserInfoGet,
  processUserInfoSet
} from '../UserInfoToolsProcessor'

describe('UserInfoToolsProcessor', () => {
  beforeEach(() => {
    getUserInfoMock.mockReset()
    setUserInfoMock.mockReset()
  })

  it('returns current user info', async () => {
    getUserInfoMock.mockResolvedValue({
      info: {
        name: 'Gn',
        preferredAddress: 'Gn',
        basicInfo: 'Creator of @i.',
        preferences: 'Prefers direct communication.',
        updatedAt: 1
      },
      isEmpty: false,
      filePath: '/tmp/user-info.md'
    })

    const result = await processUserInfoGet()

    expect(result.success).toBe(true)
    expect(result.isEmpty).toBe(false)
    expect(result.info.name).toBe('Gn')
    expect(result.file_path).toBe('/tmp/user-info.md')
  })

  it('rejects an empty full overwrite payload', async () => {
    const result = await processUserInfoSet({})

    expect(result.success).toBe(false)
    expect(result.message).toContain('At least one user info field must be provided')
  })

  it('saves a fully replaced user profile', async () => {
    setUserInfoMock.mockResolvedValue({
      info: {
        name: 'Gn',
        preferredAddress: 'Gn',
        basicInfo: 'Creator of @i.',
        preferences: 'Prefers direct communication.',
        updatedAt: 2
      },
      isEmpty: false,
      filePath: '/tmp/user-info.md'
    })

    const result = await processUserInfoSet({
      name: 'Gn',
      preferredAddress: 'Gn',
      basicInfo: 'Creator of @i.',
      preferences: 'Prefers direct communication.'
    })

    expect(setUserInfoMock).toHaveBeenCalledWith({
      name: 'Gn',
      preferredAddress: 'Gn',
      basicInfo: 'Creator of @i.',
      preferences: 'Prefers direct communication.'
    })
    expect(result.success).toBe(true)
    expect(result.info.updatedAt).toBe(2)
  })
})
