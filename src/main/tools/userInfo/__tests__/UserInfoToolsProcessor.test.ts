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
  processUserInfo,
  processUserInfoGet,
  processUserInfoSet
} from '../UserInfoToolsProcessor'

describe('UserInfoToolsProcessor', () => {
  beforeEach(() => {
    getUserInfoMock.mockReset()
    setUserInfoMock.mockReset()
  })

  it('returns Missing required parameter: action when action is absent', async () => {
    const result = await processUserInfo({})

    expect(result).toEqual({ success: false, message: 'Missing required parameter: action' })
  })

  it('rejects unknown actions with an expected-action error', async () => {
    const result = await processUserInfo({ action: 'clear' })

    expect(result).toEqual({ success: false, message: 'Invalid action: clear. Expected one of: get, set' })
  })

  it('dispatches action get to processUserInfoGet', async () => {
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

    const result = await processUserInfo({ action: 'get' })

    expect(getUserInfoMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual(expect.objectContaining({
      success: true,
      isEmpty: false,
      file_path: '/tmp/user-info.md',
      info: expect.objectContaining({ name: 'Gn' })
    }))
  })

  it('dispatches action set to processUserInfoSet', async () => {
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

    const result = await processUserInfo({ action: 'set', name: 'Gn' })

    expect(setUserInfoMock).toHaveBeenCalledWith({
      name: 'Gn',
      preferredAddress: '',
      basicInfo: '',
      preferences: ''
    })
    expect(result).toEqual(expect.objectContaining({
      success: true,
      info: expect.objectContaining({ updatedAt: 2 })
    }))
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
