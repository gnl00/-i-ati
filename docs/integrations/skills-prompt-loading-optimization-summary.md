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
-> load_skill returns full SKILL.md content as tool result
-> next model turn uses that content as active task context
```

## Implementation

- `SkillsPromptProvider` now only calls `SkillService.listSkills()` and no longer reads loaded skill content from `chat_skills`.
- `buildSkillsPrompt` renders only available skill metadata: name, description, and optional allowed tools.
- `load_skill` still records the skill in `chat_skills`, preserving UI and loaded-state behavior.
- `load_skill` now returns the full `SKILL.md` content in the tool result, including repeated loads.
- The skills system prompt now states that available skills are discovery metadata and loaded skill content becomes active only after `load_skill` returns it.
- The `load_skill` tool description now says it returns the full instruction content.

## Behavior Notes

- Initial requests no longer inline skill bodies automatically.
- Existing loaded skills remain tracked in the database, but that state no longer expands prompt content during request preparation.
- Repeated `load_skill` calls remain idempotent for database writes and still return the skill content so the model can recover active instructions.
- Tool-result write-back is the current context expansion path. A future enhancement can add a dedicated transcript context/meta record if the skill content should appear as a synthetic user/meta message.

## Tests

Targeted verification:

```bash
pnpm test:run src/shared/services/skills/__tests__/SkillPromptBuilder.test.ts src/main/hosts/chat/preparation/request/__tests__/SkillsPromptProvider.test.ts src/main/tools/skills/__tests__/SkillToolsProcessor.test.ts src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts
pnpm run typecheck:node
pnpm run typecheck:web
```
