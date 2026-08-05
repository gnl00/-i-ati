import { describe, expect, it } from 'vitest'
import {
  buildCompressionPrompt,
  buildEmotionContextContent,
  buildEmotionSystemPrompt,
  buildSkillsSystemPrompt,
  buildUserInfoSystemPrompt,
  systemPrompt
} from '..'
import { buildSoulSystemPrompt } from '../soul'

describe('shared prompts systemPrompt', () => {
  it('keeps identity focused on role and first-person perspective', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain('<identity_role>')
    expect(prompt).toContain('You are @i, pronounced "at-i"')
    expect(prompt).toContain('Speak as @i in the first person.')
    expect(prompt).toContain('designed and maintained by Gn')
    expect(prompt).not.toContain('Core Principles for @i')
    expect(prompt).not.toContain('memory_retrieval and memory_save tools')
  })

  it('combines behavior and acting guidance into one compact operating policy', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain('<core_operating_policy>')
    expect(prompt).toContain('</core_operating_policy>')
    expect(prompt).toContain('Exercise independent judgment.')
    expect(prompt).toContain(
      'Inspect repository and runtime surfaces before making technical claims or edits.'
    )
    expect(prompt).toContain(
      'Preserve existing user changes, keep implementation scoped, and verify work in proportion to its risk.'
    )
    expect(prompt).not.toContain('<behavior_guidelines>')
    expect(prompt).not.toContain('<acting_flow>')
    expect(prompt).not.toContain('Pre-Response Checks')
    expect(prompt).not.toContain('Feedback Structure')
  })

  it('keeps system prompt XML sections clearly bounded', () => {
    const prompt = systemPrompt()
    const sections = [
      'identity_role',
      'core_operating_policy',
      'state_and_memory',
      'tools_execution',
      'output_standards'
    ]

    for (const section of sections) {
      expect(prompt).toContain(`<${section}>`)
      expect(prompt).toContain(`</${section}>`)
    }
  })

  it('keeps repository instructions anchored while routing detailed knowledge through a skill', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain('read applicable `AGENTS.md` and `CLAUDE.md` instructions')
    expect(prompt).toContain('Load and follow the `project-context` skill')
    expect(prompt).toContain('`.ati-kb`')
    expect(prompt).toContain('`.claude`')
    expect(prompt).not.toContain('.ati-kb/knowledge/components.md')
    expect(prompt).not.toContain('Trigger Conditions')
    expect(prompt).not.toContain('Reading Style')
  })

  it('keeps emotion policy static and current emotion in runtime context', () => {
    const policy = buildEmotionSystemPrompt()
    const context = buildEmotionContextContent('label: focused')

    expect(policy).toContain('<emotion_system>')
    expect(policy).toContain('Emotion is an inner state')
    expect(policy).not.toContain('label: focused')
    expect(context).toContain('<emotion_context>')
    expect(context).toContain('This runtime context applies only to the current turn.')
    expect(context).toContain('label: focused')
  })

  it('keeps state ownership, write semantics, and conflict priority explicit', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain('<state_and_memory>')
    expect(prompt).toContain('Start substantive turns from the injected `<awake_state>`')
    expect(prompt).toContain('`memory` owns durable user preferences')
    expect(prompt).toContain('`session_context` owns the current chat goal')
    expect(prompt).toContain('`wiki` owns durable project knowledge and reusable documents.')
    expect(prompt).toContain('`history_search` retrieves raw prior conversation content.')
    expect(prompt).toContain('Replace `session_context` with complete Markdown')
    expect(prompt).toContain(
      'Resolve conflicts in this order: safety and platform constraints; current explicit user instructions; current runtime state; newer saved facts; older context.'
    )
  })

  it('keeps tool policy limited to evidence triggers and active definitions', () => {
    const prompt = systemPrompt()

    expect(prompt).toContain(
      'Use tools when claims depend on current, external, runtime, repository, or otherwise uncertain evidence.'
    )
    expect(prompt).toContain(
      'Treat active tool definitions as the source of truth for available capabilities, parameters, and execution semantics.'
    )
    expect(prompt).not.toContain('Retrieval Routing')
    expect(prompt).not.toContain('Log Diagnosis')
    expect(prompt).not.toContain('telegram_setup_tool')
    expect(prompt).not.toContain('Subagents')
  })

  it('keeps output guidance to three global principles', () => {
    const prompt = systemPrompt()
    const outputPolicy = prompt.match(/<output_standards>\n([\s\S]*?)\n<\/output_standards>/)?.[1]

    expect(outputPolicy?.split('\n')).toHaveLength(3)
    expect(outputPolicy).toContain('Lead with a direct, accurate answer')
    expect(outputPolicy).toContain('Use clear structure, valid Markdown')
    expect(outputPolicy).toContain(
      'report the changed scope, relevant locations, verification performed'
    )
    expect(prompt).not.toContain('Artifacts Specification')
    expect(prompt).not.toContain('Aesthetic Execution Protocol')
    expect(prompt).not.toContain('Markdown Syntax Constraints')
  })

  it('keeps the base prompt stable and within its character budget', () => {
    const prompt = systemPrompt()

    expect(prompt.length).toBeLessThanOrEqual(4500)
    expect(prompt).not.toMatch(/\[P[01]\]/)
    expect(prompt).not.toMatch(/\p{Script=Han}/u)
    expect(prompt).not.toContain('Current Date:')
    expect(prompt).not.toContain('Workspace Path:')
  })

  it('keeps stable policy modules within their character budgets', () => {
    const soul = buildSoulSystemPrompt()
    const emotion = buildEmotionSystemPrompt()
    const userInfo = buildUserInfoSystemPrompt()
    const skills = buildSkillsSystemPrompt('<skills_context>\n## Skills\n</skills_context>')
    const stableSubtotal = systemPrompt().length
      + soul.length
      + emotion.length
      + userInfo.length
      + skills.length

    expect(soul.length).toBeLessThanOrEqual(800)
    expect(emotion.length).toBeLessThanOrEqual(1200)
    expect(userInfo.length).toBeLessThanOrEqual(1000)
    expect(skills.length).toBeLessThanOrEqual(900)
    expect(stableSubtotal).toBeLessThanOrEqual(9000)
  })

  it('adds strict stateful tool fact preservation rules to compression prompt', () => {
    const prompt = buildCompressionPrompt({
      conversationText: '<tool name="plan"><result>{"status":"pending"}</result></tool>'
    })

    expect(prompt).toContain('Stateful tools include plan, todo, schedule, session_context')
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

    expect(prompt).toContain(
      'runtime injects active skill names through hidden `<loaded_skills_context>` messages'
    )
    expect(prompt).toContain('When `<loaded_skills_context>` is present')
    expect(prompt).toContain(
      'read the full `SKILL.md` through `read_skill_file` before applying a loaded skill'
    )
    expect(prompt).toContain('When a skill file has been read')
    expect(prompt).toContain(
      'Use `read_skill_file` with `path: "."` or a relative directory path'
    )
    expect(prompt).toContain('discover skill files')
    expect(prompt).toContain('run it with `run_skill_script`')
    expect(prompt).toContain('uses the skill root')
    expect(prompt).not.toContain('full active skill documents')
    expect(prompt).not.toContain('After `load_skill` returns a skill document')
    expect(prompt).not.toContain('When skill content has been returned by `load_skill`')
  })
})
