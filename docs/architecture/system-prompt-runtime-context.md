# System Prompt Runtime Context

## Goal

Keep the static system prompt stable for prompt caching, while moving volatile runtime values into hidden `role: "user"` context messages.

The first migrated section is `<system-environment>`, which carries current date, current time, timezone, operating system, and workspace path.

## Current Implementation

Static prompt source:

- `src/shared/prompts/index.ts`
- `systemPrompt(_workspace)` keeps stable behavior rules and references `<system-environment>` for volatile environment details.
- The static `<working_environment>` section no longer embeds concrete date, time, OS, timezone, or workspace path.

Runtime context source:

- `src/main/hosts/chat/preparation/request/SystemEnvironmentContextProvider.ts`
- The provider emits a hidden user message with `source: MESSAGE_SOURCE.SYSTEM_PROMPT`.
- The message content is:

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
- `SystemEnvironmentContextProvider` is injected through `RequestMessageBuilder.setEphemeralContextMessages(...)`.
- The current order is:
  - `<system-environment>`
  - loaded skills context
  - knowledgebase context
  - `<awake_state>`
  - current user input

Hidden source:

- `src/shared/messages/messageSources.ts`
- `MESSAGE_SOURCE.SYSTEM_PROMPT = "system_prompt"`
- `MESSAGE_SOURCE.SYSTEM_PROMPT` is included in `HIDDEN_MESSAGE_SOURCES`.

## Extension Rule

Future system prompt content that becomes volatile or runtime-specific should reuse:

```ts
source: MESSAGE_SOURCE.SYSTEM_PROMPT
```

Use XML tags to distinguish sections:

```xml
<system-environment>...</system-environment>
```

```xml
<system-runtime-policy>...</system-runtime-policy>
```

```xml
<system-workspace-policy>...</system-workspace-policy>
```

This keeps renderer/history/search behavior simple: the message source marks the carrier as hidden system prompt context, and the XML tag marks the concrete section for the model.

## Testing

Relevant tests:

- `src/shared/prompts/__tests__/index.test.ts`
  - Asserts volatile environment values stay out of the static system prompt.
- `src/main/hosts/chat/preparation/request/__tests__/SystemEnvironmentContextProvider.test.ts`
  - Asserts the provider emits `<system-environment>` with the expected payload and `MESSAGE_SOURCE.SYSTEM_PROMPT`.
- `src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts`
  - Asserts `<system-environment>` is injected before `<awake_state>` and before the current user input.

## Follow-Up Candidates

- Review whether `awake_state` should keep its own `workspacePath` field or rely on `<system-environment>`.
- Move additional runtime-specific system prompt sections into `MESSAGE_SOURCE.SYSTEM_PROMPT` messages when they would reduce static prompt cache stability.
