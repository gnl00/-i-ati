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
- Add the processor in `src/main/tools/<tool-group>/...Processor.ts`.
- Register the handler in `src/main/tools/index.ts`.
- Add tests for the definition, metadata, processor behavior, and handler registration path.

For model-output tools used only to constrain a maintenance request:
- Keep the definition under `src/shared/tools/<tool-group>/definitions.ts` and export it with `satisfies ToolDefinition`.
- Use the same `{ type: 'function', function: { name, description, parameters } }` shape.
- Keep `function.parameters.type` as `object`; place arrays inside object properties, for example `{ messages: SmartMessageDraft[] }`.
- Import the definition directly from the service that calls `unifiedChatRequest`.
- Add parser tests for `response.toolCalls`, missing tool calls, malformed arguments, and field validation.

When adding or changing a tool, verify the schema with targeted tests plus `pnpm run typecheck:node`. Include `pnpm run typecheck:web` when renderer IPC or UI reads the result.
