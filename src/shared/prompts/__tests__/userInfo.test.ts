import { describe, expect, it } from 'vitest'
import {
  buildUserInfoContextContent,
  buildUserInfoPrompt,
  buildUserInfoSystemPrompt
} from '../userInfo'

describe('buildUserInfoPrompt', () => {
  it('keeps policy free of runtime user profile values', () => {
    const prompt = buildUserInfoSystemPrompt()

    expect(prompt).toContain('<user_info_system>')
    expect(prompt).toContain('User Info Policy')
    expect(prompt).toContain('If user_info_context shows `preferredAddress` is missing')
    expect(prompt).toContain('user_info_set')
    expect(prompt).not.toContain('Gn')
    expect(prompt).not.toContain('ati_bot')
  })

  it('renders user profile and Telegram runtime data in user_info_context', () => {
    const prompt = buildUserInfoContextContent({
      name: 'Gn',
      preferredAddress: 'Gn',
      basicInfo: 'developer',
      preferences: 'direct answers'
    }, {
      telegram: {
        enabled: true,
        botUsername: 'ati_bot',
        botId: '123456',
        mode: 'polling',
        proactiveMessagingAvailable: true
      }
    })

    expect(prompt).toContain('<user_info_context>')
    expect(prompt).toContain('"name": "Gn"')
    expect(prompt).toContain('"preferredAddress": "Gn"')
    expect(prompt).toContain('"basicInfo": "developer"')
    expect(prompt).toContain('"preferences": "direct answers"')
    expect(prompt).toContain('"enabled": true')
    expect(prompt).toContain('"botUsername": "ati_bot"')
    expect(prompt).toContain('"botId": "123456"')
    expect(prompt).toContain('"mode": "polling"')
    expect(prompt).toContain('"proactiveMessagingAvailable": true')
  })

  it('omits Telegram runtime object when Telegram info is absent', () => {
    const prompt = buildUserInfoContextContent({
      name: 'Gn',
      preferredAddress: 'Gn'
    })

    expect(prompt).not.toContain('"telegram"')
  })

  it('keeps buildUserInfoPrompt as a compatibility composition', () => {
    const prompt = buildUserInfoPrompt({
      name: 'Gn',
      preferredAddress: 'Gn'
    })

    expect(prompt).toContain('<user_info_system>')
    expect(prompt).toContain('<user_info_context>')
    expect(prompt).toContain('"name": "Gn"')
  })
})
