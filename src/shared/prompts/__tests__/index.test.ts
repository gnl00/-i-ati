import { describe, expect, it } from 'vitest'
import { systemPrompt } from '..'

describe('shared prompts systemPrompt', () => {
  it('includes log_search guidance for runtime diagnosis', () => {
    const prompt = systemPrompt('./workspaces/chat-1')

    expect(prompt).toContain('Log Diagnosis')
    expect(prompt).toContain('log_search')
    expect(prompt).toContain('运行时错误')
    expect(prompt).toContain('帮我看看为什么报错')
  })

  it('includes Telegram proactive messaging guidance', () => {
    const prompt = systemPrompt('./workspaces/chat-1')

    expect(prompt).toContain('telegram_setup_tool')
    expect(prompt).toContain('telegram_search_targets')
    expect(prompt).toContain('telegram_send_message')
    expect(prompt).toContain('需要跨 chat 或目标不明确时')
    expect(prompt).toContain('target_chat_uuid')
  })
})
