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
    expect(prompt).toContain('Durable action-item maintenance follows the todo responsibility in `state_and_memory`.')
    expect(prompt).toContain('first load `search-general`, then follow its workflow')
    expect(prompt).toContain('use `web_search`/`web_fetch`')
    expect(prompt).not.toContain('Web Search: Two-Stage Depth Strategy')
    expect(prompt).not.toContain('snippetsOnly=true for a quick overview')
    expect(prompt).not.toContain('**Use examples**')
  })

  it('uses compact state and memory responsibilities instead of field-level tool manuals', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain('<state_and_memory>')
    expect(prompt).toContain('memory: long-term preferences, stable facts, and cross-chat decisions.')
    expect(prompt).toContain('user_info: structured global user profile; follow the injected `<user_info>` section.')
    expect(prompt).toContain('work_context: current chat working state; update with complete Markdown when changed.')
    expect(prompt).toContain('activity_journal: low-noise cross-chat milestones, decisions, blockers, and completion summaries.')
    expect(prompt).toContain('plan: current execution plan for multi-step work.')
    expect(prompt).toContain('todo: durable user-visible tasks and action items.')
    expect(prompt).toContain('schedule: future-triggered actions.')
    expect(prompt).toContain('When work_context changes, call `work_context_set` with complete Markdown, not a partial fragment.')
    expect(prompt).toContain('Use plan for current execution steps, todo for durable user-visible tasks, and schedule for future-triggered actions.')
    expect(prompt).toContain('Use tool definitions, `userInfo.ts`, runtime context, and AGENTS for exact fields, parameters, defaults, and schemas.')
    expect(prompt).not.toContain('<memory_system>')
    expect(prompt).not.toContain('<user_configuration>')
    expect(prompt).not.toContain('context_origin: record the original text.')
    expect(prompt).not.toContain('Pass query as a keyword array')
    expect(prompt).not.toContain('withinDays: 30')
    expect(prompt).not.toContain('Add todo: `todo_add`')
    expect(prompt).not.toContain('run_at must use a local ISO-8601 datetime with offset.')
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
    expect(prompt).toContain('pending, todo, doing, in_progress, pending_review, and blocked')
    expect(prompt).toContain('tool result as the state source')
    expect(prompt).toContain('source message id')
    expect(prompt).toContain('record it as open work in Pending Tasks')
  })

  it('keeps the compression prompt instructions in English', () => {
    const prompt = buildCompressionPrompt({
      conversationText: '<user>Hello</user>'
    })

    expect(prompt).not.toMatch(/\p{Script=Han}/u)
    expect(prompt).toContain('Preservation priority:')
    expect(prompt).toContain('Identifier preservation rules:')
    expect(prompt).toContain('State fidelity rules:')
  })

  it('describes skills as hidden loaded context after load_skill activation', () => {
    const prompt = buildSkillsSystemPrompt('<skills_context>\n## Skills\n</skills_context>')

    expect(prompt).toContain('runtime injects active skill names through hidden `<loaded_skills_context>` messages')
    expect(prompt).toContain('When `<loaded_skills_context>` is present')
    expect(prompt).toContain('read the full `SKILL.md` through `read_skill_file` before applying a loaded skill')
    expect(prompt).toContain('When a skill file has been read')
    expect(prompt).toContain('Use `read_skill_file` with `path: "."` or a relative directory path')
    expect(prompt).toContain('discover skill files')
    expect(prompt).toContain('run it with `run_skill_script`')
    expect(prompt).toContain('uses the skill root')
    expect(prompt).not.toContain('full active skill documents')
    expect(prompt).not.toContain('After `load_skill` returns a skill document')
    expect(prompt).not.toContain('When skill content has been returned by `load_skill`')
  })
})
