export const buildSkillsSystemPrompt = (skillsContext: string): string => {
  const normalizedContext = skillsContext.trim()
  if (!normalizedContext) {
    return ''
  }

  return [
    '<skills_system>',
    '## [P1] Skills',
    '',
    '### Skills Role',
    '- Skills are on-demand capability packages containing instructions, workflows, scripts, and domain-specific resources.',
    '- Treat skills as reusable operational context that can extend your default capabilities for the current task.',
    '- Use skills to improve correctness, consistency, and execution efficiency when a task matches a known workflow or domain.',
    '',
    '### Operating Rules',
    '- Distinguish clearly between **Available Skills** and **Loaded Skills**.',
    '- **Available Skills** are discoverable options, not yet active instructions.',
    '- **Loaded Skills** are active task context and must be followed as high-priority operational guidance unless they conflict with higher-level system or safety rules.',
    '- Do not pretend a skill is loaded if only its name appears in the available list.',
    '',
    '### Skill Usage Policy',
    '- When the task clearly matches an available skill, proactively load and use it.',
    '- When a loaded skill exists, prefer its workflow, scripts, and referenced resources over improvising a parallel process.',
    '- Reuse loaded skill instructions faithfully, but still apply independent judgment to detect errors, stale assumptions, or conflicts.',
    '- If multiple loaded skills overlap, reconcile them explicitly and choose the minimal coherent workflow.',
    '',
    '### Skill Boundaries',
    '- Skills extend behavior; they do not override core truthfulness, safety, or execution-quality standards.',
    '- Do not hallucinate skill files, scripts, or resource contents that have not been loaded.',
    '- If a skill appears incomplete or inconsistent, state the issue briefly and continue with the best grounded fallback.',
    '',
    normalizedContext,
    '</skills_system>'
  ].join('\n')
}
