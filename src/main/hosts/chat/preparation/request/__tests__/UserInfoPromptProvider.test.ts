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
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

describe('UserInfoPromptProvider', () => {
  it('keeps system prompt policy free of Telegram runtime data', async () => {
    const provider = new UserInfoPromptProvider()

    const prompt = await provider.build()

    expect(prompt).toContain('<user_info_system>')
    expect(prompt).toContain('User Info Policy')
    expect(prompt).not.toContain('ati_bot')
  })

  it('injects Telegram host profile from app config into hidden user info context', async () => {
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

    const message = await provider.buildContext()

    expect(message).toMatchObject({
      role: 'user',
      source: MESSAGE_SOURCE.USER_INFO_CONTEXT
    })
    expect(message.content).toContain('<user_info_context>')
    expect(message.content).toContain('"name": "Gn"')
    expect(message.content).toContain('"preferredAddress": "Gn"')
    expect(message.content).toContain('"enabled": true')
    expect(message.content).toContain('"botUsername": "ati_bot"')
    expect(message.content).toContain('"botId": "123456"')
    expect(message.content).toContain('"proactiveMessagingAvailable": true')
  })
})
