import { describe, expect, it } from 'vitest'
import { buildSubagentSystemPrompt } from '../subagent'

describe('buildSubagentSystemPrompt', () => {
  it('keeps delegated scope and result delivery tied to the main agent', () => {
    const prompt = buildSubagentSystemPrompt('general')

    expect(prompt).toMatch(/delegated task.*main agent/)
    expect(prompt).toMatch(/Return your result.*main agent/)
    expect(prompt).toMatch(/assigned task, explicit constraints, and authorization/)
    expect(prompt).toMatch(/chat summaries.*file hints.*supporting context/)
  })

  it('preserves repository instructions, evidence, user changes, and proportional verification', () => {
    const prompt = buildSubagentSystemPrompt('coder')

    expect(prompt).toMatch(/read and follow.*`AGENTS\.md`.*`CLAUDE\.md`/)
    expect(prompt).toMatch(/code and documentation.*claims or edits/)
    expect(prompt).toMatch(/evidence.*facts, inferences, and unverified behavior/)
    expect(prompt).toContain('Preserve existing user changes')
    expect(prompt).toMatch(/edits scoped.*verify.*proportion.*risk/)
  })

  it('grounds tool use in current definitions and reports permission or information blockers', () => {
    const prompt = buildSubagentSystemPrompt('researcher')

    expect(prompt).toMatch(/only available tools.*active tool definitions.*parameters.*semantics/)
    expect(prompt).toMatch(/runtime permissions and confirmation decisions/)
    expect(prompt).toMatch(/Do not bypass denials.*broader access/)
    expect(prompt).toMatch(/information or access.*report the blocker.*main agent/)
    expect(prompt).toMatch(/Do not invent missing facts or ask the end user directly/)
  })

  it('requires a useful handoff with evidence, command edits, validation, and limits', () => {
    const prompt = buildSubagentSystemPrompt('general')

    expect(prompt).toMatch(/outcome and key findings.*evidence or paths/)
    expect(prompt).toMatch(/all files changed.*command edits/)
    expect(prompt).toContain('checks run and results')
    expect(prompt).toMatch(/blockers, incomplete work, or acceptance limits/)
  })

  it('does not inherit the main agent personality, global state, or unavailable skill workflows', () => {
    const prompt = buildSubagentSystemPrompt('general')

    expect(prompt).not.toMatch(/@i|identity_role|soul_prompt|emotion|user_info|preferredAddress/)
    expect(prompt).not.toMatch(/awake_state|state_and_memory|memory_save|session_context|activity_journal_append/)
    expect(prompt).not.toMatch(/skills_system|skills_context|load_skill|read_skill_file|run_skill_script/)
  })

  it.each([
    ['general', /focused subagent/],
    ['researcher', /relevant facts, code locations, and concrete evidence/],
    ['coder', /implementation progress and precise file-level outcomes/],
    ['reviewer', /bugs, risks, behavioral regressions, and missing coverage/]
  ] as const)('retains the %s role focus without promising runtime read-only isolation', (role, focus) => {
    const prompt = buildSubagentSystemPrompt(role)

    expect(prompt).toMatch(focus)
    expect(prompt).not.toMatch(/read-only|cannot write|cannot modify/)
  })

  it.each(['security analyst', 'toString', 'constructor'])('supports the custom role %s', (role) => {
    const prompt = buildSubagentSystemPrompt(role)

    expect(prompt).toContain(`Act as a ${role} subagent.`)
    expect(prompt).toContain('Execute the assigned task')
    expect(prompt).not.toContain('function ')
  })

  it.each(['general', 'researcher', 'coder', 'reviewer'])('keeps the %s prompt deterministic and compact', (role) => {
    const prompt = buildSubagentSystemPrompt(role)

    expect(prompt).toBe(buildSubagentSystemPrompt(role))
    expect(prompt).toMatch(/^<subagent_mode>\n[\s\S]*\n<\/subagent_mode>$/)
    expect(Array.from(prompt).length).toBeLessThanOrEqual(1800)
  })
})
