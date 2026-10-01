# Tool Definition Workflow
Tool definitions use the shared `ToolDefinition` shape from `src/shared/tools/registry.ts`:

```ts
{
  type: 'function',
  function: {
    name: 'tool_name',
    description: 'What the tool does.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      $schema: 'http://json-schema.org/draft-07/schema#'
    }
  }
}
```

For executable embedded tools:
- Add the definition under `src/shared/tools/<tool-group>/definitions.ts`.
- Export it with `satisfies ToolDefinition[]`.
- Add the group to `src/shared/tools/definitions/index.ts`.
- Add metadata in `src/shared/tools/<tool-group>/metadata.ts` and include it from `src/shared/tools/metadata.ts`.
- Set `needChatUUID: false` in registered metadata when a tool does not accept
  runtime `chat_uuid` arguments (for example, `emotion_report`). Omission or
  `true` preserves injection from the runtime chat UUID. The executor removes
  model-supplied `chat_uuid` when injection is disabled or no runtime chat exists.
  `context.chatUuid` remains available separately; MCP arguments are unchanged.
- Return execution facts and original values. The runtime prepares bounded model
  content once; tools with their own artifact or pagination support should return
  concise readable paths and continuation metadata.
- Add the processor in `src/main/tools/<tool-group>/...Processor.ts`.
- Register the handler in `src/main/tools/index.ts`.
- Add tests for the definition, metadata, processor behavior, and handler registration path.
  Cover long output recovery, storage failure, cancellation, raw UI delivery,
  and stable model replay when the tool introduces new output behavior.

- Tools that can return large active-run content should apply a bounded
  model-visible contract before returning. Workspace-readable artifacts use
  confined relative paths and a bounded reader; direct HTTP tools follow
  [ADR-0011](../../decisions/0011-size-based-web-fetch-workspace-artifacts.md).

For model-output tools used only to constrain a maintenance request:
- Keep the definition under `src/shared/tools/<tool-group>/definitions.ts` and export it with `satisfies ToolDefinition`.
- Use the same `{ type: 'function', function: { name, description, parameters } }` shape.
- Keep `function.parameters.type` as `object`; place arrays inside object properties, for example `{ messages: SmartMessageDraft[] }`.
- Import the definition directly from the service that calls `unifiedChatRequest`.
- Add parser tests for `response.toolCalls`, missing tool calls, malformed arguments, and field validation.

When adding or changing a tool, verify the schema with targeted tests plus `pnpm run typecheck:node`. Include `pnpm run typecheck:web` when renderer IPC or UI reads the result.

## Telegram gateway lifecycle

The `tg_gateway_tool` embedded tool accepts `{ action: 'start' | 'stop' | 'status' }`
and reuses the existing Main-owned Telegram gateway service. It returns
`success`, `action`, `message`, and a `status` snapshot when available. The
snapshot includes running/starting state, configuration readiness, bot identity,
last error and activity timestamps; it excludes bot credentials.

`start` uses saved configuration and queues asynchronous startup. A successful
queued result has `starting: true`; call `status` to inspect completion or
failure. Missing token, disabled integration, or unavailable main model returns
a failed result with the prerequisite. Use `telegram_setup_tool` to configure a
new token. `stop` invalidates startup and initiates polling shutdown through the
existing service. None of these actions changes saved configuration.

The tool does not receive an injected `chat_uuid` and is unavailable to
subagents. `status` has no risk; `start` and `stop` retain warning risk metadata.

## Telegram proactive delivery

`telegram_send_message` requires the Main-injected source `chat_uuid`. Its
`target_chat_uuid` argument selects a recipient from `telegram_search_targets`;
it does not select where the local delivery copy is saved. An explicit recipient
is remembered for future sends from the source chat. With no saved target or
inbound binding, a single reachable peer/topic can be selected automatically;
multiple recipients require user selection before retrying the tool.

Message text accepts Markdown up to 30000 source characters. Short messages use
safe HTML, while structured/long messages use native Rich Messages.

A successful result includes `sourceChatUuid`, `deliveryRecorded`, `deliveryComplete`,
`sentMessageIds` for overflow messages, and, when the
local record completes, `deliveryMessageId`. `success: true` means the Telegram
send succeeded even if `deliveryRecorded: false`; do not retry the send to repair
local storage. `deliveryComplete: false` means some chunks arrived and later
delivery failed; do not resend the full message. Each delivered chunk has a
source-chat reply receipt. Ordinary inbound bindings are unchanged. Replies to recorded
pushes select their source chat for that run. See
[ADR 0032](../../decisions/0032-telegram-delivery-source-routing.md).
