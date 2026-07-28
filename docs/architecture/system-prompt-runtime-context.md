# System Prompt Runtime Context

## Goal

Keep the static system prompt small and stable for prompt caching. Volatile
runtime values travel through hidden `role: "user"` context records and are
attached to the current user request during protocol materialization.

## Current Implementation

Static prompt source:

- `src/shared/prompts/index.ts`
- `systemPrompt()` provides the minimal identity, operating, state, tool, and
  output kernel.
- `SystemPromptComposer` adds stable Soul, available-skills, user information,
  and emotion policy modules.
- [ADR 0012](../decisions/0012-minimal-system-prompt-kernel.md) defines module
  ownership and character budgets.

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
- `RequestMessageBuilder.setEphemeralContextMessages(...)` adds hidden context
  records in this order:
  - loaded skills
  - user information
  - knowledgebase results
  - system environment
  - `<awake_state>`
  - available images
- `DefaultRequestMaterializer` collects these records into one
  `<request_context>` part and appends it to the following user protocol
  message.
- Canonical transcript records retain their original hidden sources.

Hidden source:

- `src/shared/messages/messageSources.ts`
- Each runtime context family has an explicit `MESSAGE_SOURCE`.
- Every request-context source is included in `HIDDEN_MESSAGE_SOURCES`.

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
- `src/main/hosts/chat/preparation/request/__tests__/SystemEnvironmentContextProvider.test.ts`
  - Asserts the provider emits `<system-environment>` with the expected payload
    and `MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT`.
- `src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts`
  - Asserts context providers preserve request preparation order.
- `src/main/agent/runtime/transcript/__tests__/RequestMaterializer.test.ts`
  - Asserts hidden context is appended to the current user protocol message.
- `src/main/services/skills/__tests__/SkillService.test.ts`
  - Asserts built-in specialized workflows are discoverable and readable.
