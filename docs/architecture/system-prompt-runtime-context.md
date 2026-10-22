# System Prompt Runtime Context

## Goal

Keep the static system prompt small and stable for prompt caching. Volatile
runtime values travel through hidden `role: "user"` context records and are
attached to the current user request during protocol materialization.

## Current Implementation

Main chat static prompt source:

- `src/shared/prompts/index.ts`
- `systemPrompt()` provides the minimal identity, operating, state, tool, and
  output kernel.
- `SystemPromptComposer` adds stable Soul, available-skills, user information,
  and emotion policy modules.
- [ADR 0012](../decisions/0012-minimal-system-prompt-kernel.md) defines module
  ownership and character budgets.

The main kernel's `tools_execution` policy defines execution readiness: once
required facts, constraints, and validation are clear, use the simplest sufficient
approach and defaults for reversible choices. Revisit those choices for new
evidence, conflicting constraints, or failed validation. Necessary fact checks
and authorization gates remain prerequisites. Specialized workflows stay in
existing skills; this change leaves their instructions untouched. This is prompt
guidance, without runtime timers, call limits, or automatic interruption of model
output.

Background subagents use the independent
[`buildSubagentSystemPrompt(role)`](../../src/shared/prompts/subagent.ts).
It owns delegated execution and result delivery rules without inheriting the
main chat's Soul, profile, emotion, skills catalog, or global state policies.
See [Subagent runtime](subagent-mvp.md#worker-提示词职责) and
[ADR 0040](../decisions/0040-independent-subagent-system-prompt.md).

Runtime context providers:

- `src/main/hosts/chat/preparation/request/SystemEnvironmentContextProvider.ts`
- `src/main/hosts/chat/preparation/request/LoadedSkillsContextProvider.ts`
- `src/main/hosts/chat/preparation/request/UserInfoPromptProvider.ts`
- `src/main/hosts/chat/preparation/request/KnowledgebaseContextProvider.ts`
- `src/main/hosts/chat/preparation/request/AwakeContextProvider.ts`
- `src/main/hosts/chat/preparation/request/AvailableImagesContextProvider.ts`

`SystemEnvironmentContextProvider` carries the current date, time, timezone,
operating system, and workspace path:

```xml
<system-environment>
{
  "currentDate": "2026-05-17",
  "currentTime": "2026-05-17T11:04:05+08:00",
  "timezone": "Asia/Shanghai",
  "operatingSystem": {
    "platform": "darwin",
    "arch": "arm64"
  },
  "workspacePath": "./workspaces/chat-1"
}
</system-environment>
```

Request injection:

- `src/main/hosts/chat/preparation/RunRequestFactory.ts`
- `buildContextMessages({ contexts, ... })` adds hidden context
  records in this order:
  - loaded skills
  - user information
  - knowledgebase results
  - system environment
  - `<awake_state>`
  - available images
- `projectContextRequest` collects these records into one
  `<request_context>` part and appends it to the following user protocol
  message.
- Canonical transcript records retain their original hidden sources.
- Before starting a new Chat run, `RunRequestFactory` stores the formatted suffix
  as `ChatMessage.requestContextSnapshot` on the final user record (including a
  vision observation when present). The existing message JSON owns this snapshot;
  the visible `content`, segments, and search text stay unchanged.
- `ChatContextMapper` restores that metadata. `projectContextRequest` prefers the
  saved suffix and appends it exactly once, so rebuilding history on the next
  turn does not drop or regenerate the previously sent context.
- Snapshot text identifies its scope: old snapshots describe state at that turn;
  the latest request snapshot provides current state and does not renew past
  instructions or authorizations. Existing snapshots are replayed verbatim.
- Legacy messages without snapshots keep their existing history representation;
  snapshots are created only for new turns. No backfill or SQL migration occurs.
- Normal context budgeting still measures snapshots and may compress or omit
  complete old history. Stable suffix replay does not guarantee provider cache
  hits, nor stability of tools, system policy, or assistant-step reconstruction.

See [ADR 0049](../decisions/0049-persisted-request-context-snapshots.md).

`AwakeContextProvider` serializes snapshot version 2 as compact JSON. It keeps one
chat identity block, omits absent/empty work context, and bounds recent activity
clues to three. Unrelated clues carry only titles and local dates; relevant task
hits can include complete short summaries. Memory selection and the context's
protocol position stay unchanged. See [ADR 0048](../decisions/0048-bounded-awake-activity-context.md).

Hidden source:

- `src/shared/messages/messageSources.ts`
- Each runtime context family has an explicit `MESSAGE_SOURCE`.
- Every request-context source is included in `HIDDEN_MESSAGE_SOURCES`.

Available skill metadata comes from the in-memory source-folder catalog. Startup and
source changes scan configured folders plus embedded resources; request preparation
does not recover installed copies or scan the filesystem. Selected names missing
from the current catalog are omitted from loaded-skills context. See
[Source-folder skills](../decisions/0047-source-folder-skills.md).

## Extension Rule

New content is routed by volatility and specialization:

- Stable cross-task policy joins the minimal system kernel.
- Volatile turn state uses a dedicated hidden request-context source.
- Specialized workflows use built-in or installed skills.
- Exact tool usage stays in tool definitions.

Runtime context uses explicit XML tags:

```xml
<system-environment>...</system-environment>
```

```xml
<system-runtime-policy>...</system-runtime-policy>
```

```xml
<system-workspace-policy>...</system-workspace-policy>
```

The message source controls renderer, history, and search visibility. The XML
tag identifies the semantic section for the model.

## Testing

Relevant tests:

- `src/shared/prompts/__tests__/index.test.ts`
  - Asserts stable semantic anchors, moved-content boundaries, and character
    budgets.
- `src/shared/prompts/__tests__/subagent.test.ts`
  - Asserts delegated execution rules, role guidance, excluded main-chat
    policies, and the worker prompt character budget.
- `src/main/services/subagent/__tests__/subagent-runtime-factory.test.ts`
  - Asserts the independent prompt reaches the runner with task constraints,
    role permissions, and the existing context modes.
- `src/main/hosts/chat/preparation/request/__tests__/SystemEnvironmentContextProvider.test.ts`
  - Asserts the provider emits `<system-environment>` with the expected payload
    and `MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT`.
- `src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts`
  - Asserts context providers preserve request preparation order.
- `src/main/agent/runtime/context/__tests__/ContextRequest.test.ts`
  - Asserts hidden context is appended to the current user protocol message.
- `src/main/services/skills/__tests__/SkillService.test.ts`
  - Asserts built-in specialized workflows are discoverable and readable.
