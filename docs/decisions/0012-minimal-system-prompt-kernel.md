# Minimal System Prompt Kernel

**Status:** Accepted<br>
**Date:** 2026-07-28<br>
**Related architecture:** [System prompt runtime context](../architecture/system-prompt-runtime-context.md)<br>
**Related decision:** [Prompt cache ordering](0002-prompt-cache-ordering.md)<br>
**Related integration:** [Skills](../integrations/skills.md)

## Context

The stable system prompt accumulated general behavior, state routing, tool
manuals, project knowledge instructions, frontend artifact conventions, and
formatting details. Several sections repeated information already expressed by
tool definitions, skill metadata, runtime context, or neighboring prompt
sections.

Before this decision, the base `systemPrompt()` content measured 12,524
characters. The behavior, acting flow, project knowledge, tool execution, and
output sections accounted for 8,351 characters.

The application already has the boundaries needed for a smaller stable prefix:

- `SystemPromptComposer` assembles stable policy modules.
- `DefaultRequestMaterializer` attaches volatile request context to the current
  user message.
- Tool definitions carry names, parameters, schemas, and focused usage
  descriptions.
- Built-in skills carry specialized workflows and can be activated on demand.

## Decision

The provider-facing stable prefix composes a minimal base kernel and stable
extension modules:

```text
base kernel:
  identity_role
  core_operating_policy
  state_and_memory
  tools_execution
  output_standards

stable extensions:
  soul_prompt
  skills_system + available skills catalog
  user_info_system
  emotion_system
```

Each layer has one responsibility:

- `identity_role` defines @i, first-person identity, developer ownership, and
  personal-agent positioning.
- `soul_prompt` owns configurable tone, values, working style, and collaboration
  style.
- `core_operating_policy` owns grounded judgment, scoped execution, evidence,
  and verification reporting.
- `state_and_memory` owns the `awake_state` starting point, durable state
  responsibilities, write timing, and one conflict order.
- `user_info_system` owns profile integrity and preferred-address behavior.
- `emotion_system` owns inner-emotion continuity and report timing.
- `skills_system` owns discovery, activation, full skill reading, and skill
  safety boundaries.
- `tools_execution` owns evidence and current-information triggers while active
  tool definitions remain the operational source of truth.
- `output_standards` owns directness, proportional structure, and precise
  implementation reporting.

XML tags remain the module boundary. Internal duplicate headings and `[P0]` /
`[P1]` labels are removed. The conflict order is defined once:

```text
safety and platform constraints
current explicit user instruction
current runtime context
newer saved facts
older saved context
```

Specialized workflows move into built-in skills:

- `project-context` owns repository instruction and `.ati-kb` reading.
- `frontend-artifact` owns runnable frontend artifact and visual execution
  conventions.
- `search-general` continues to own web search workflow.

## Size Budgets

Prompt tests enforce character budgets:

- Base `systemPrompt()`: at most 4,500 characters.
- Soul wrapper with the default Soul: at most 800 characters.
- Emotion policy: at most 1,200 characters.
- User information policy: at most 1,000 characters.
- Skills wrapper with an empty catalog shell: at most 900 characters.
- Stable policy subtotal excluding the variable available-skills catalog: at
  most 9,000 characters.

Character budgets provide a deterministic repository-level regression signal.
Provider token accounting remains the runtime measurement for cache and billing
analysis.

The accepted implementation measures 3,339 characters for `systemPrompt()` and
6,729 characters for the stable policy subtotal with the default Soul and a
minimal available-skills catalog shell.

## Consequences

- The stable request prefix becomes smaller and easier to review.
- Personality remains configurable through Soul.
- Runtime state keeps the established request-context and `awake_state`
  boundaries.
- Tool schemas and skills become the authoritative homes for specialized
  execution details.
- Available skill metadata becomes a required routing surface for specialized
  workflows.
- Prompt tests assert semantic anchors, moved-content boundaries, module order,
  and size budgets.

## Verification

The implementation is accepted when:

1. Prompt unit tests cover the stable semantic contract and size budgets.
2. Skill service tests discover and read all built-in skills.
3. Request preparation tests preserve the established system prompt and
   request-context ordering.
4. Node and renderer type checks remain green.
