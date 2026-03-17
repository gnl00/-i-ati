# Request Adapter Plugin API

This document describes the current custom plugin contract for `request-adapter` plugins.

If you are starting from scratch, read this first:

- `docs/plugins/plugin-author-checklist.md`

Status:

- Supported today: local plugins loaded from `userData/plugins/<pluginId>`
- Supported capabilities today: `request-adapter`
- Recommended export shape today: a single `requestAdapter`

Template:

- TypeScript SSE template: `plugins/templates/request-adapter-plugin-typescript/`
- TypeScript raw stream template: `plugins/templates/request-adapter-plugin-typescript-raw/`
- Complete example: `plugins/google-gemini-compatible-adapter/`
- Complete TypeScript example: `plugins/google-gemini-compatible-adapter-typescript/`

## 1. Manifest

Each plugin directory must contain a `plugin.json`.

Example:

```json
{
  "id": "gemini-compatible-adapter",
  "name": "Google Gemini Compatible Adapter",
  "version": "0.1.0",
  "description": "Local request-adapter plugin for Google Gemini GenerateContent API.",
  "capabilities": [
    {
      "kind": "request-adapter",
      "providerType": "gemini",
      "modelTypes": ["llm", "vlm"]
    }
  ],
  "entries": {
    "main": "./main.mjs"
  }
}
```

Required fields:

- `id`: unique plugin id
- `name`: display name
- `version`: plugin version string
- `capabilities`: capability declarations
- `entries.main`: main-process entry file

## 2. Recommended main entry hooks

If you want to start from a ready-to-build scaffold, copy:

- `plugins/templates/request-adapter-plugin-typescript/`
- or `plugins/templates/request-adapter-plugin-typescript-raw/`

That template includes:

- local `types.ts`
- `src/main.ts`
- `plugin.json`
- `tsconfig.json`
- `package.json`

You can then edit only `src/main.ts` and `plugin.json`.

Recommended export:

```js
export const requestAdapter = {
  providerType: 'gemini',
  streamProtocol: 'sse',
  supportsStreamOptionsUsage: false,

  request({ request }) {
    return {
      endpoint: `${request.baseUrl}/models/${request.model}:generateContent`,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': request.apiKey
      },
      body: {
        contents: []
      }
    }
  },

  parseResponse({ request, raw }) {
    return {
      id: 'response-id',
      model: request.model,
      timestamp: Date.now(),
      content: '',
      finishReason: 'stop',
      raw
    }
  },

  parseStreamResponse({ request, chunk }) {
    return null
  }
}
```

Also supported:

- `export default { requestAdapter }`

Recommended development flow:

1. Copy an appropriate template under `plugins/templates/`
2. Update `plugin.json`
3. Implement `src/main.ts`
4. Run `pnpm build`
5. Import the directory from Settings -> Plugins

## 3. Hook contract

### `requestAdapter.providerType`

Provider type used by provider definitions.

Examples:

- `openai`
- `claude`
- `gemini`

### `requestAdapter.streamProtocol`

Optional.

Supported values:

- `sse`: runtime will split the stream into SSE `data: ...` events before calling `parseStreamResponse`
- `raw`: runtime passes raw string chunks directly to `parseStreamResponse`

Default behavior:

- If omitted, streaming is treated as `sse`

### `requestAdapter.supportsStreamOptionsUsage`

Optional boolean.

Use `true` only if your upstream API supports an OpenAI-style `stream_options.include_usage`.

### `requestAdapter.request({ request })`

Transforms `IUnifiedRequest` into your upstream API request.

Return value:

```ts
{
  endpoint: string
  headers?: Record<string, string>
  body: unknown
}
```

Notes:

- `endpoint` should be the final absolute request URL
- `headers` are merged directly into `fetch`
- `body` is JSON-serialized by the runtime

### `requestAdapter.parseResponse({ request, raw })`

Transforms a non-streaming upstream response into `IUnifiedResponse`.

### `requestAdapter.parseStreamResponse({ request, chunk })`

Optional.

Transforms one streaming chunk into `IUnifiedStreamResponse | null`.

For `streamProtocol: 'sse'`:

- `chunk` looks like `data: {...}`

For `streamProtocol: 'raw'`:

- `chunk` is the raw decoded stream text returned by the upstream API
- see `plugins/templates/request-adapter-plugin-typescript-raw/` for a minimal raw example

## 4. Unified request model

### `IUnifiedRequest`

```ts
interface IUnifiedRequest {
  adapterPluginId: string
  baseUrl: string
  apiKey: string
  modelType?: string
  model: string
  prompt?: string
  messages: ChatMessage[]
  stream?: boolean
  tools?: any[]
  requestOverrides?: Record<string, any>
  options?: {
    maxTokens?: number
  }
}
```

Field notes:

- `adapterPluginId`: selected request-adapter plugin id
- `baseUrl`: provider base URL configured by the user
- `apiKey`: upstream API key
- `model`: selected model id
- `messages`: normalized conversation history
- `stream`: defaults to `true` in most chat flows
- `tools`: normalized tool definitions when tool calling is enabled
- `options.maxTokens`: optional token budget

### `ChatMessage`

```ts
interface ChatMessage {
  role: string
  content: string | VLMContent[]
  name?: string
  toolCallId?: string
  toolCalls?: IToolCall[]
  model?: string
  modelRef?: { accountId: string; modelId: string }
  typewriterCompleted?: boolean
  source?: string
  segments: MessageSegment[]
}
```

Important fields:

- `role`: typically `system`, `user`, `assistant`, or `tool`
- `content`: plain text or multimodal content array
- `toolCalls`: assistant tool calls already normalized to `IToolCall[]`
- `toolCallId`: tool result messages refer back to the tool call id
- `segments`: structured message segments; available if your adapter needs more detail

### `IToolCall`

```ts
interface IToolCall {
  id: string
  index?: number
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}
```

## 5. Unified response model

### `IUnifiedResponse`

```ts
interface IUnifiedResponse {
  id: string
  model: string
  timestamp: number
  content: string
  reasoning?: string
  toolCalls?: IToolCall[]
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error'
  usage?: ITokenUsage
  raw?: any
}
```

### `IUnifiedStreamResponse`

```ts
interface IUnifiedStreamResponse {
  id: string
  model: string
  delta?: {
    content?: string
    reasoning?: string
    toolCalls?: IToolCall[]
    finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error'
  }
  usage?: ITokenUsage
  raw?: any
}
```

### `ITokenUsage`

```ts
interface ITokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}
```

## 6. Gemini example

Reference plugin:

- [plugins/google-gemini-compatible-adapter/plugin.json](/Users/gnl/Workspace/code/-i-ati/plugins/google-gemini-compatible-adapter/plugin.json)
- [plugins/google-gemini-compatible-adapter/main.mjs](/Users/gnl/Workspace/code/-i-ati/plugins/google-gemini-compatible-adapter/main.mjs)

It shows:

- `request()` building Gemini `generateContent` / `streamGenerateContent` requests
- `parseResponse()` transforming Gemini JSON responses into `IUnifiedResponse`
- `parseStreamResponse()` transforming Gemini SSE chunks into `IUnifiedStreamResponse`

Official Gemini API reference:

- https://ai.google.dev/api/generate-content?hl=zh-cn#method:-models.generatecontent

## 7. Current limitations

Current plugin runtime is still intentionally small:

- only local plugins are supported
- only `request-adapter` capability is runtime-loaded
- plugins run inside the main process
- there is no version-aware install/rollback strategy yet

Next step recommendation:

- ship a small `@i/plugin-sdk` package later
- expose `defineRequestAdapterPlugin(...)`
- export runtime-safe helper functions for SSE parsing and response normalization
