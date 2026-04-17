import { describe, expect, it } from 'vitest'
import { buildUserInfoPrompt } from '../userInfo'

describe('buildUserInfoPrompt', () => {
  it('renders Telegram host subsection when Telegram runtime info is available', () => {
    const prompt = buildUserInfoPrompt({
      name: 'Gn',
      preferredAddress: 'Gn'
    }, {
      telegram: {
        enabled: true,
        botUsername: 'ati_bot',
        botId: '123456',
        mode: 'polling',
        proactiveMessagingAvailable: true
      }
    })

    expect(prompt).toContain('### Telegram Host')
    expect(prompt).toContain('- Enabled: true')
    expect(prompt).toContain('- Bot username: ati_bot')
    expect(prompt).toContain('- Bot ID: 123456')
    expect(prompt).toContain('- Mode: polling')
    expect(prompt).toContain('- Proactive messaging: available')
    expect(prompt).toContain('Telegram proactive messaging requires resolving a reachable Telegram target before sending.')
  })

  it('omits Telegram host subsection when Telegram runtime info is absent', () => {
    const prompt = buildUserInfoPrompt({
      name: 'Gn',
      preferredAddress: 'Gn'
    })

    expect(prompt).not.toContain('### Telegram Host')
  })
})
