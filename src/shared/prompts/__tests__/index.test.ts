import { describe, expect, it } from 'vitest'
import { buildCompressionPrompt, buildSkillsSystemPrompt, systemPrompt } from '..'

describe('shared prompts systemPrompt', () => {
  it('includes log_search guidance for runtime diagnosis', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain('Log Diagnosis')
    expect(prompt).toContain('log_search')
    expect(prompt).toContain('runtime errors')
    expect(prompt).toContain('help me understand this error')
  })

  it('includes Telegram proactive messaging guidance', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain('telegram_setup_tool')
    expect(prompt).toContain('telegram_search_targets')
    expect(prompt).toContain('telegram_send_message')
    expect(prompt).toContain('Cross-chat Telegram target or unclear target')
    expect(prompt).toContain('target_chat_uuid')
  })

  it('uses awake_state as startup context instead of mandatory tail emotion reporting', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain('<awake_state>')
    expect(prompt).toContain('Context Refresh Policy')
    expect(prompt).toContain('Call `emotion_report` when this turn materially changes inner emotion or accumulated residue.')
    expect(prompt).not.toContain('emotion_report is also mandatory')
    expect(prompt).not.toContain('Every turn conversation before final response')
  })

  it('keeps system prompt XML sections clearly bounded', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain('<acting_flow>')
    expect(prompt).toContain('</acting_flow>')
    expect(prompt).toContain('<project_knowledge_base>')
    expect(prompt).toContain('</project_knowledge_base>')
    expect(prompt).toContain('<system-environment>')
    expect(prompt).not.toContain('<system_prompt>')
    expect(prompt).not.toContain('</system_prompt>')
    expect(prompt).not.toContain('</execution_flow>')
  })

  it('keeps volatile environment values out of the static system prompt', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain('Current environment details are injected in `<system-environment>`.')
    expect(prompt).not.toContain('./workspaces/chat-1')
    expect(prompt).not.toContain('Current Date:')
    expect(prompt).not.toContain('Workspace Path:')
    expect(prompt).not.toContain('Operating System:')
    expect(prompt).not.toContain('Timezone:')
  })

  it('centralizes repeated tool routing guidance into a routing matrix', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain('**Routing Matrix**')
    expect(prompt).toContain('Retrieval tool selection follows the Context Refresh Policy.')
    expect(prompt).toContain('Durable action-item maintenance follows the Todos rule in `user_configuration`.')
    expect(prompt).toContain('first load `search-general`, then follow its workflow')
    expect(prompt).toContain('use `web_search`/`web_fetch`')
    expect(prompt).not.toContain('Web Search: Two-Stage Depth Strategy')
    expect(prompt).not.toContain('snippetsOnly=true for a quick overview')
    expect(prompt).not.toContain('**Use examples**')
  })

  it('keeps the system prompt text in English', () => {
    const prompt = systemPrompt()

    expect(prompt).not.toMatch(/\p{Script=Han}/u)
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

  it('describes skills as hidden loaded context after load_skill activation', () => {
    const prompt = buildSkillsSystemPrompt('<skills_context>\n## Skills\n</skills_context>')

    expect(prompt).toContain('runtime injects the full active skill documents through hidden `<loaded_skills_context>` messages')
    expect(prompt).toContain('When `<loaded_skills_context>` is present')
    expect(prompt).toContain('active skill content appears in hidden loaded-skill context')
    expect(prompt).toContain('Use `read_skill_file` with `path: "."` or a relative directory path')
    expect(prompt).toContain('discover skill files')
    expect(prompt).toContain('run it with `run_skill_script`')
    expect(prompt).toContain('uses the skill root')
    expect(prompt).not.toContain('After `load_skill` returns a skill document')
    expect(prompt).not.toContain('When skill content has been returned by `load_skill`')
  })
})
