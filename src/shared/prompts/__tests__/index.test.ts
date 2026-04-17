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
})
