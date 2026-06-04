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
- Built-in skills live under `resources/skills` in development and `process.resourcesPath/skills` in packaged builds.
- `SkillService.listSkills()` merges built-in and user-installed skill metadata, with user-installed same-name skills taking precedence.
- `load_skill` still records the skill in `chat_skills`, preserving UI and loaded-state behavior.
- `load_skill` returns a lightweight status result and no longer returns full `SKILL.md` content.
- `LoadedSkillsContextProvider` reads `chat_skills`, loads active `SKILL.md` files, and builds a hidden `MESSAGE_SOURCE.SKILLS_CONTEXT` user message.
- `RequestMessageBuilder` inserts hidden skills context before the latest user message, including after compressed summaries.
- `AgentLoop` refreshes hidden skills context after successful `load_skill` or `unload_skill` so same-run continuations see the updated active skill set.
- The skills system prompt now states that available skills are discovery metadata and loaded skill content becomes active after `load_skill` activates it.
- General web search workflow details moved from the static system prompt into the built-in `search-general` skill, whose description covers any user request that asks to search, web search, look up, browse, find latest/current information, verify facts, cite sources, or use `web_search`/`web_fetch`.

## Behavior Notes

- Initial requests no longer inline skill bodies automatically.
- Existing loaded skills remain tracked in the database and are rebuilt into hidden context during request preparation.
- Repeated `load_skill` calls remain idempotent for database writes and return a lightweight confirmation.
- Hidden skills context is filtered from UI rendering and history search.
- Compression summaries do not need to preserve full skill documents because the active set is reconstructed from `chat_skills`.
- The static system prompt keeps only a minimal trigger for `search-general`: when the user asks to search or use `web_search`/`web_fetch`, first load `search-general`, then follow its workflow. The two-stage `snippetsOnly` search workflow lives in `resources/skills/search-general/SKILL.md`.

## Tests

Targeted verification:

```bash
pnpm test:run src/main/services/skills/__tests__/SkillService.test.ts src/main/tools/skills/__tests__/SkillToolsProcessor.test.ts src/shared/tools/skills/__tests__/definitions.test.ts src/shared/prompts/__tests__/index.test.ts src/shared/services/skills/__tests__/SkillPromptBuilder.test.ts src/main/hosts/chat/preparation/request/__tests__/SkillsPromptProvider.test.ts src/main/hosts/chat/preparation/request/__tests__/LoadedSkillsContextProvider.test.ts
pnpm test:run src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts src/main/orchestration/chat/run/runtime/__tests__/DefaultMainAgentRuntimeRunner.integration.test.ts src/shared/services/__tests__/RequestMessageBuilder.test.ts
pnpm run typecheck:node
pnpm run typecheck:web
```
