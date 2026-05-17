import { describe, expect, it } from 'vitest'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { SystemEnvironmentContextProvider } from '../SystemEnvironmentContextProvider'

const parseSystemEnvironment = (content: string) => {
  const json = content
    .replace('<system-environment>', '')
    .replace('</system-environment>', '')
    .trim()

  return JSON.parse(json)
}

describe('SystemEnvironmentContextProvider', () => {
  it('builds hidden system prompt environment context', () => {
    const message = new SystemEnvironmentContextProvider().build({
      workspacePath: './workspaces/chat-1',
      now: new Date(2026, 4, 17, 11, 4, 5)
    })

    expect(message.role).toBe('user')
    expect(message.source).toBe(MESSAGE_SOURCE.SYSTEM_PROMPT)
    expect(message.content).toContain('<system-environment>')
    expect(message.content).toContain('</system-environment>')

    const payload = parseSystemEnvironment(message.content as string)
    expect(payload.currentDate).toBe('2026-05-17')
    expect(payload.currentTime).toMatch(/^2026-05-17T11:04:05[+-]\d{2}:\d{2}$/)
    expect(payload.timezone).toEqual(expect.any(String))
    expect(payload.operatingSystem).toEqual({
      platform: process.platform,
      arch: process.arch
    })
    expect(payload.workspacePath).toBe('./workspaces/chat-1')
  })
})
