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
- Declare `resultCompaction` in metadata when the tool result requires persisted
  cold-replay compaction. Set `enabled`, `level`, `compactorId`, and the
  `modelInputPolicy`; register the matching compactor in the main-process
  tool-result compactor registry.
- Keep model selection inside `CompactAgent` and domain extraction instructions
  inside the compactor implementation. Semantic profiles can use the reusable
  agent; deterministic compaction remains available as a bounded fallback.
- Keep dynamic tool data inside the structured untrusted-source envelope.
  Define an input budget before model dispatch and propagate the parent run
  abort signal. Use `redact-secrets` for content that can contain credentials.
- Inject the production scheduler from the run composition root through the
  host-owned `ToolResultCompactionTrigger` contract. The host persists and
  forwards complete raw content, then schedules compact content for future
  submitted runs. Render modules and Node test modules should stay free of
  eager embedded-tool and Electron imports.
- Add the processor in `src/main/tools/<tool-group>/...Processor.ts`.
- Register the handler in `src/main/tools/index.ts`.
- Add tests for the definition, metadata, processor behavior, and handler registration path.
  Compaction metadata also requires scheduler routing, compactor behavior,
  model success and fallback coverage, positive-size-gain handling, full raw
  active continuation, raw renderer delivery, immutable raw facts, execution
  metrics, queue bounds, input budgets, secret redaction, cancellation, atomic
  claim behavior, and future-run replay selection coverage.

For model-output tools used only to constrain a maintenance request:
- Keep the definition under `src/shared/tools/<tool-group>/definitions.ts` and export it with `satisfies ToolDefinition`.
- Use the same `{ type: 'function', function: { name, description, parameters } }` shape.
- Keep `function.parameters.type` as `object`; place arrays inside object properties, for example `{ messages: SmartMessageDraft[] }`.
- Import the definition directly from the service that calls `unifiedChatRequest`.
- Add parser tests for `response.toolCalls`, missing tool calls, malformed arguments, and field validation.

When adding or changing a tool, verify the schema with targeted tests plus `pnpm run typecheck:node`. Include `pnpm run typecheck:web` when renderer IPC or UI reads the result.
