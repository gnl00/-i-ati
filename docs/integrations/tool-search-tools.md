# App tool discovery

Last verified against source: 2026-09-29.

[EmbeddedToolsRegistry](../../src/shared/tools/registry.ts) holds embedded handlers
and external tool definitions. [Main tool registration](../../src/main/tools/index.ts)
registers `available_tools` and `search_tools`; shared schemas are in
[registry definitions](../../src/shared/tools/registry/definitions.ts).

## Public behavior

- `available_tools` returns external tool names and descriptions, without full schemas.
- `search_tools({ tool_names })` resolves full definitions by exact tool names from the registry.
- An empty name list returns `success: false` with `tool_names cannot be empty`.
- Unknown names are omitted from the resolved list. A nonempty request can succeed with no matches; callers must inspect the returned definitions.

`search_tools` performs name lookup. Regex/semantic search, automatic server
installation and guaranteed token reductions are outside this implementation.
External tools still require their registered runtime transport and handler.

The previous third-party article and benchmark copy was replaced by this app
contract and a bounded [research reference](../reference/anthropic-tool-search.md).
