import { describe, expect, it, vi } from 'vitest'

const {
  getUserInfoMock,
  getConfigMock
} = vi.hoisted(() => ({
  getUserInfoMock: vi.fn(),
  getConfigMock: vi.fn()
}))

vi.mock('@main/services/userInfo/UserInfoService', () => ({
  default: {
    getUserInfo: getUserInfoMock
  }
}))

vi.mock('@main/hosts/chat/config/AppConfigStore', () => ({
  AppConfigStore: class {
    getConfig() {
      return getConfigMock()
    }
  }
}))

import { UserInfoPromptProvider } from '../UserInfoPromptProvider'

describe('UserInfoPromptProvider', () => {
  it('injects Telegram host profile from app config into the user info prompt', async () => {
    getUserInfoMock.mockResolvedValue({
      info: {
        name: 'Gn',
        preferredAddress: 'Gn'
      },
      isEmpty: false,
      exists: true,
      filePath: '/tmp/user-info.json'
    })
    getConfigMock.mockReturnValue({
      telegram: {
        enabled: true,
        botToken: '123:abc',
        botUsername: 'ati_bot',
        botId: '123456',
        mode: 'polling'
      }
    })

    const provider = new UserInfoPromptProvider()

    const prompt = await provider.build()

    expect(prompt).toContain('### Telegram Host')
    expect(prompt).toContain('- Enabled: true')
    expect(prompt).toContain('- Bot username: ati_bot')
    expect(prompt).toContain('- Bot ID: 123456')
    expect(prompt).toContain('- Proactive messaging: available')
  })
})
