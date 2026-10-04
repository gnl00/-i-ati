# ADR-0040: Independent subagent system prompt

**Status:** Accepted<br>
**Date:** 2026-10-04<br>
**Related architecture:** [Subagent runtime](../architecture/subagent-mvp.md)<br>
**Related decision:** [Minimal system prompt kernel](0012-minimal-system-prompt-kernel.md)

## Context

Background subagents previously inherited the main chat's complete
`SystemPromptComposer` output and appended role guidance. The main prompt
requires user profile handling, emotion reports, skill activation, and global
state maintenance. The worker bootstrap carries a delegated task rather than
the main chat's AwakeState, user profile, or loaded-skill contexts, and its tool
permissions deny the corresponding management tools.

Changing `contextMode` only changes task context; it cannot remove these
inherited system rules. The mismatch creates competing instructions and adds
unrelated context to every delegated run.

## Decision

`SubagentRuntimeFactory` calls the pure
[`buildSubagentSystemPrompt(role)`](../../src/shared/prompts/subagent.ts) builder
directly. The worker prompt owns:

- The delegated task, constraints, role emphasis, and parent-agent handoff.
- Applicable repository instructions, code and documentation evidence,
  preservation of existing user changes, and proportional verification.
- Current tool definitions, execution permissions and confirmation decisions.
- Reporting missing information or authorization to the parent agent.
- Findings or changes, evidence locations, files touched, validation, and limits.

The main chat keeps the existing identity, Soul, skills, profile, emotion, and
global state policies. Worker prompts do not copy those modules. Built-in
roles and custom role guidance remain supported; a role does not grant tools
or override the delegated task's scope.

Model selection, workspace resolution, task text, file hints, `contextMode`,
metadata-derived tool permissions, parent confirmation, execution limits, and
summary/artifact return paths retain their existing contracts. No new
configuration or persisted data is introduced.

## Consequences

- Worker instructions match the available task context and capabilities.
- The worker system prefix is independent of main-chat Soul and skill catalog
  changes, and excludes unrelated profile and emotion policies.
- The parent must carry relevant user constraints and authorization in the
  delegated task. Recent-message excerpts provide bounded background and do
  not guarantee that all prior constraints are included.
- Role guidance remains an instruction, while runtime metadata and approval
  remain the execution boundary. Reviewer/researcher access to `exec` does not
  provide an operating-system-level read-only sandbox.
- Prompt byte or character reduction does not by itself prove token, cache,
  latency, cost, or task-quality improvements. Live provider comparisons remain
  a separate acceptance step.

## Verification

Prompt tests cover role guidance, repository and execution safeguards, result
delivery, exclusion of main-chat modules, and a compact character budget.
Factory tests cover forwarding the independent prompt, task constraints,
workspace and permissions, both context modes, and context-read failures.
Existing runner and executor tests cover parent confirmation, continuation
after denial, result delivery, execution limits, and forbidden recursive tools.

The task-scoped repository checks are:

```sh
pnpm exec vitest run \
  src/shared/prompts/__tests__/subagent.test.ts \
  src/shared/prompts/__tests__/index.test.ts \
  src/main/hosts/chat/preparation/request/__tests__/SystemPromptComposer.test.ts \
  src/main/services/subagent/__tests__ \
  src/shared/tools/__tests__/permissions.test.ts \
  src/main/agent/tools/__tests__/ToolExecutor.test.ts
pnpm exec eslint \
  src/shared/prompts/subagent.ts \
  src/shared/prompts/__tests__/subagent.test.ts \
  src/main/services/subagent/subagent-runtime-factory.ts \
  src/main/services/subagent/__tests__/subagent-runtime-factory.test.ts \
  --rule 'prettier/prettier: [error, {singleQuote: true, semi: false, trailingComma: "none", printWidth: 120}]' \
  --max-warnings 0
pnpm run typecheck:node
pnpm run typecheck:web
pnpm run check:main-boundaries
pnpm run test:main-architecture
pnpm run check:main-doc-paths
git diff --check
```

The explicit Prettier options preserve the surrounding single-quote,
semicolon-free source style without changing the repository ESLint configuration.

Rollback restores the factory's previous composition path without a data
migration. Runtime permissions and approvals remain authoritative in either
version.
