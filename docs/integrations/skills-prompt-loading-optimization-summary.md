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
-> load_skill records the skill in chat_skills and returns SKILL.md plus skill_root
-> runtime rebuilds active skill names and metadata paths from chat_skills
-> hidden user message source=skills_context carries <loaded_skills_context>
-> model uses the returned instructions directly; read_skill_file handles extra resources
```

## Implementation

- `SkillsPromptProvider` now only calls `SkillService.listSkills()` and no longer reads loaded skill content from `chat_skills`.
- `buildSkillsPrompt` renders only available skill metadata: name, description, and optional allowed tools.
- Built-in skills live under `resources/skills` in development and `process.resourcesPath/skills` in packaged builds.
- `SkillService.listSkills()` merges built-in and user-installed skill metadata, with user-installed same-name skills taking precedence.
- `load_skill` still records the skill in `chat_skills`, preserving UI and loaded-state behavior.
- `load_skill` returns full `SKILL.md` content and `skill_root` on demand, including for already-active skills. Its result uses ordinary bounded tool-result history and recovery; hidden context does not duplicate the body.
- `LoadedSkillsContextProvider` reads `chat_skills`, resolves active skill
  metadata, and builds a hidden `MESSAGE_SOURCE.SKILLS_CONTEXT` user message
  with skill names and paths.
- `buildContextMessages` inserts hidden skills context before the latest user message, including after compressed summaries. Runtime protocol projection merges it into that user request.
- `AgentLoop` refreshes hidden skills context after successful `load_skill` or `unload_skill` so same-run continuations see the updated active skill set.
- The skills system prompt now states that available skills are discovery metadata. Activation is optional task context; `load_skill` returns instructions when the model chooses to use them.
- General web search workflow details moved from the static system prompt into the built-in `search-general` skill, whose description covers any user request that asks to search, web search, look up, browse, find latest/current information, verify facts, cite sources, or use `web_search`/`web_fetch`.
- Project instruction and `.ati-kb` routing moved into the built-in
  `project-context` skill.
- Runnable frontend artifact and aesthetic execution conventions moved into
  the built-in `frontend-artifact` skill.

## Behavior Notes

- Initial requests no longer inline skill bodies automatically.
- Existing loaded skills remain tracked in the database. Their names and paths
  are rebuilt into hidden context during request preparation.
- Repeated `load_skill` calls remain idempotent for database writes and return current instructions. Existing instructions in model context should be reused.
- Hidden skills context is filtered from UI rendering and history search.
- Compression summaries do not need to preserve full skill documents because
  the active set is reconstructed from `chat_skills` and full content is returned by `load_skill` on demand.
- The available-skills catalog description routes matching search requests to
  `search-general`. The two-stage search-discovery and explicit-fetch workflow lives in
  `resources/skills/search-general/SKILL.md`.
- The static system prompt keeps one repository trigger for `project-context`.
  Frontend artifact routing is discoverable through the available-skills
  catalog.

## Tests

Targeted verification:

```bash
pnpm test:run src/main/services/skills/__tests__/SkillService.test.ts src/main/tools/skills/__tests__/SkillToolsProcessor.test.ts src/shared/tools/skills/__tests__/definitions.test.ts src/shared/prompts/__tests__/index.test.ts src/shared/services/skills/__tests__/SkillPromptBuilder.test.ts src/main/hosts/chat/preparation/request/__tests__/SkillsPromptProvider.test.ts src/main/hosts/chat/preparation/request/__tests__/LoadedSkillsContextProvider.test.ts
pnpm test:run src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts src/main/orchestration/chat/run/runtime/__tests__/DefaultMainAgentRuntimeRunner.integration.test.ts src/main/hosts/chat/preparation/request/__tests__/buildContextMessages.test.ts src/main/agent/runtime/context/__tests__/ContextRequest.test.ts
pnpm run typecheck:node
pnpm run typecheck:web
```

## 2026-10-15 contract update

Manual `/sk:` selection retains name/path-only context. Models choose whether to
use it and load missing instructions once. `run_skill_script` now accepts an
explicit shell command, resolves bundled scripts in place, and defaults to the
task workspace. See [ADR-0045](../decisions/0045-on-demand-skill-content-and-workspace-commands.md)
and the current [Skills contract](skills.md).
