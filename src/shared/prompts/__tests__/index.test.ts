import { describe, expect, it } from 'vitest'
import { buildCompressionPrompt, systemPrompt } from '..'

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

  it('uses awake_state as startup context instead of mandatory tail emotion reporting', () => {
    const prompt = systemPrompt('./workspaces/chat-1')

    expect(prompt).toContain('<awake_state>')
    expect(prompt).toContain('Context Refresh Policy')
    expect(prompt).toContain('Call `emotion_report` when this turn materially changes inner emotion or accumulated residue.')
    expect(prompt).not.toContain('emotion_report is also mandatory')
    expect(prompt).not.toContain('Every turn conversation before final response')
  })

  it('adds strict stateful tool fact preservation rules to compression prompt', () => {
    const prompt = buildCompressionPrompt({
      conversationText: '<tool name="plan_create"><result>{"status":"pending"}</result></tool>'
    })

    expect(prompt).toContain('Stateful tools include plan_*, todo_*, schedule_*, work_context_*')
    expect(prompt).toContain('Stateful tool results are source-of-truth records')
    expect(prompt).toContain('currentStepId')
    expect(prompt).toContain('failureReason')
    expect(prompt).toContain('dependsOn')
    expect(prompt).toContain('pending、todo、doing、in_progress、pending_review、blocked')
    expect(prompt).toContain('tool result as the state source')
    expect(prompt).toContain('source message id')
    expect(prompt).toContain('record it as open work in Pending Tasks')
  })
})
