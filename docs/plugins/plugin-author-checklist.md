# Plugin Author Checklist

This checklist is for authors building local plugins, especially `request-adapter` plugins.

Use it together with:

- `docs/plugins/request-adapter-plugin-api.md`
- `plugins/templates/README.md`

## 1. Choose the Right Starting Point

- If your upstream streaming format is SSE (`data: {...}`), start from:
  - `plugins/templates/request-adapter-plugin-typescript/`
- If your upstream streaming format is raw chunk text or non-SSE framed JSON, start from:
  - `plugins/templates/request-adapter-plugin-typescript-raw/`
- If you want a real provider example, read:
  - `plugins/google-gemini-compatible-adapter-typescript/`

## 2. Manifest Checklist

Make sure `plugin.json` has:

- `id`
  - globally unique within your local plugin set
  - keep it stable across versions
- `name`
  - user-facing display name
- `version`
  - semantic version string is recommended
- `capabilities`
  - for request adapters, include one `kind: "request-adapter"` capability
- `entries.main`
  - should point to your built file
  - current templates use `./dist/main.js`

## 3. Request Adapter Hook Checklist

Your plugin should usually export:

```ts
export const requestAdapter = { ... }
export default { requestAdapter }
```

Recommended hooks:

- `request`
  - required
  - convert `IUnifiedRequest` into endpoint, headers, and request body
- `parseResponse`
  - required
  - convert non-streaming upstream JSON into `IUnifiedResponse`
- `parseStreamResponse`
  - required if upstream is streaming
  - convert one chunk into `IUnifiedStreamResponse | null`

Also set:

- `providerType`
- `streamProtocol`
- `supportsStreamOptionsUsage` if needed

## 4. Stream Protocol Checklist

Choose `streamProtocol: 'sse'` when:

- the upstream returns `data: ...`
- the upstream uses standard SSE events

Choose `streamProtocol: 'raw'` when:

- the upstream does not use SSE
- chunks are plain text, NDJSON, or custom delimiters

Questions to verify:

- Does one incoming chunk always contain one complete event?
- Do you need to ignore keep-alive or empty chunks?
- Do you need to accumulate partial JSON before parsing?
- Does the upstream emit a final usage chunk?

## 5. Unified Request Checklist

Before implementing `request`, decide how you will map:

- `request.baseUrl`
- `request.apiKey`
- `request.model`
- `request.messages`
- `request.stream`
- `request.tools`
- `request.options?.maxTokens`

If your upstream supports tools, make sure you handle:

- assistant tool calls from `message.toolCalls`
- tool definitions from `request.tools`
- tool result messages where `role === 'tool'`

## 6. Unified Response Checklist

For non-streaming `parseResponse`, make sure you return:

- `id`
- `model`
- `timestamp`
- `content`
- `finishReason`

Return these when available:

- `reasoning`
- `toolCalls`
- `usage`
- `raw`

For streaming `parseStreamResponse`, check:

- whether the chunk contains content delta
- whether the chunk contains tool call delta or a completed tool call
- whether the chunk contains finish reason
- whether the chunk contains usage

Return `null` when:

- the chunk is empty
- the chunk is only heartbeat/keep-alive
- the chunk is `[DONE]`
- the chunk does not produce a meaningful unified delta

## 7. Provider Naming Checklist

Keep naming stable and explicit:

- `providerType`
  - should represent the provider family, for example `gemini`

Avoid:

- changing `providerType` across plugin versions without a migration plan
- using display names as identifiers

## 8. Build Checklist

Before importing the plugin:

- run `pnpm install`
- run `pnpm build`
- confirm the built file exists at `entries.main`

For current templates, verify:

- `dist/main.js` exists

## 9. Import and Verification Checklist

After importing from Settings -> Plugins:

- confirm the plugin appears in the plugin list
- confirm version is shown correctly
- confirm the plugin is enabled
- open provider settings and verify the adapter appears in the adapter selector

Then create a provider using:

- the installed plugin itself as the adapter
- the correct API base URL

## 10. Debug Checklist

If the plugin appears installed but does not work:

- check that `plugin.json` is valid JSON
- check that `entries.main` points to a built file
- check that your capability declaration matches the intended provider type
- check that your plugin exports `requestAdapter` or `default.requestAdapter`
- check stream protocol choice: `sse` vs `raw`
- check whether upstream response shape matches your `parseResponse` or `parseStreamResponse` parser

## 11. Recommended Author Workflow

1. Copy the closest template.
2. Rename plugin id, name, and capability.
3. Implement `request`.
4. Implement `parseResponse`.
5. Implement `parseStreamResponse` only after non-streaming works.
6. Import the plugin and verify it appears in Settings.
7. Add provider config and test a real request.
