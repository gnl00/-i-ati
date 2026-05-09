# Skills Prompt Loading Optimization Summary

## Goal

Reduce initial system prompt size by keeping installed skill content out of the default prompt. The model now sees only the available skill catalog at startup and calls `load_skill` when a task needs a specific skill.

Previous flow:

```text
system prompt + available list + loaded skill 1 full text + loaded skill 2 full text
```

Current flow:

```text
system prompt + available list with descriptions
-> model calls load_skill
-> load_skill records the skill in chat_skills and returns a lightweight status
-> runtime rebuilds active SKILL.md content from chat_skills
-> hidden user message source=skills_context carries <loaded_skills_context>
-> next model turn uses that hidden context as active task context
```

## Implementation

- `SkillsPromptProvider` now only calls `SkillService.listSkills()` and no longer reads loaded skill content from `chat_skills`.
- `buildSkillsPrompt` renders only available skill metadata: name, description, and optional allowed tools.
- `load_skill` still records the skill in `chat_skills`, preserving UI and loaded-state behavior.
- `load_skill` returns a lightweight status result and no longer returns full `SKILL.md` content.
- `LoadedSkillsContextProvider` reads `chat_skills`, loads active `SKILL.md` files, and builds a hidden `MESSAGE_SOURCE.SKILLS_CONTEXT` user message.
- `RequestMessageBuilder` inserts hidden skills context before the latest user message, including after compressed summaries.
- `AgentLoop` refreshes hidden skills context after successful `load_skill` or `unload_skill` so same-run continuations see the updated active skill set.
- The skills system prompt now states that available skills are discovery metadata and loaded skill content becomes active after `load_skill` activates it.

## Behavior Notes

- Initial requests no longer inline skill bodies automatically.
- Existing loaded skills remain tracked in the database and are rebuilt into hidden context during request preparation.
- Repeated `load_skill` calls remain idempotent for database writes and return a lightweight confirmation.
- Hidden skills context is filtered from UI rendering and history search.
- Compression summaries do not need to preserve full skill documents because the active set is reconstructed from `chat_skills`.

## Tests

Targeted verification:

```bash
pnpm test:run src/shared/services/skills/__tests__/SkillPromptBuilder.test.ts src/main/hosts/chat/preparation/request/__tests__/SkillsPromptProvider.test.ts src/main/tools/skills/__tests__/SkillToolsProcessor.test.ts src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts
pnpm exec vitest run src/shared/services/__tests__/RequestMessageBuilder.test.ts src/main/hosts/chat/preparation/request/__tests__/LoadedSkillsContextProvider.test.ts src/main/orchestration/chat/run/runtime/__tests__/DefaultMainAgentRuntimeRunner.integration.test.ts
pnpm run typecheck:node
pnpm run typecheck:web
```
