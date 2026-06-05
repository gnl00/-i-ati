# Plugin System Design

## Current Stage

The current plugin system is intentionally split into two layers:

1. `builtInPluginRegistry`
2. persisted `AppPluginConfig[]`

The registry is the source of truth for built-in plugin metadata and capabilities.
User config only stores runtime state such as:

- `enabled`
- `source`
- `version`
- future external plugin metadata like `manifestPath`

This keeps built-in plugin definitions out of config JSON and makes request/runtime/UI all consume the same metadata source.

## Current Built-in Capability

Current built-in plugins include `request-adapter` capability:

- `openai-chat-compatible-adapter`
- `openai-responses-compatible-adapter`
- `openai-image-compatible-adapter`
- `claude-compatible-adapter`
- `google-gemini-compatible-adapter`

Each built-in plugin defines:

- stable plugin id
- display name
- description
- capability kind
- supported provider types
- supported model types

The request adapter direction is built-in first. Provider request protocols such as
OpenAI Chat, OpenAI Responses, Claude, Gemini, and image generation live in
`src/main/request/adapters`.

Provider-specific request body add-ons are modeled as request payload extensions.
They handle fields that sit inside an adapter protocol while varying by provider
or model family.

Built-in request payload extensions currently include:

- `deepseek-thinking`
- `xiaomi-thinking`
- `doubao-thinking`

These extensions are selected explicitly on the provider definition through:

```ts
interface ProviderPayloadExtensions {
  thinking?: string
}
```

The runtime request order is:

1. built-in adapter builds the protocol request body
2. selected request payload extensions mutate provider-specific add-on fields
3. provider `requestOverrides` are merged as the final manual override layer

## Current Flow

1. `src/shared/plugins/builtInRegistry.ts`
   defines the built-in plugin registry.
2. `ConfigDataService`
   normalizes `appConfig.plugins.items` against built-in definitions.
3. `SettingsPanel` and `PluginsManager`
   edit plugin enable/disable state against normalized plugin config.
4. `src/main/request/adapters`
   resolves the selected built-in adapter before each request.
5. `src/main/request/payload/RequestPayloadExtensionPipeline.ts`
   applies selected request payload extensions.
6. `Providers` settings
   consume the same built-in metadata to disable unavailable adapter choices.
7. `Providers` settings
   persist selected payload extensions on provider definitions.

## Why This Shape

This stage deliberately avoids jumping straight to dynamic external plugin loading.

It gives us:

- one metadata source for built-in plugins
- real enable/disable behavior in request execution
- UI and request-layer consistency
- a place to grow capability-based plugin registration

## Next Stage: Request Payload Extension Plugins

Request adapters should continue moving into built-in code. External plugin work
should focus on manifest-driven request payload extensions and other narrow
capabilities.

Recommended direction:

### 1. Manifest-first plugin model

Introduce an external plugin manifest concept such as:

```ts
type AppPluginManifest = {
  id: string
  name: string
  version: string
  capabilities: PluginCapabilityManifest[]
}
```

This should be loaded from a controlled local directory.

### 2. Capability-based loading

A plugin should declare one or more capabilities, for example:

- `request-payload-extension`
- `tool-provider`
- `embedding-provider`
- `renderer-settings-panel`

The runtime should load by capability.

Example request payload extension capability:

```json
{
  "kind": "request-payload-extension",
  "feature": "thinking",
  "thinking": {
    "levels": ["none", "low", "medium", "high"],
    "defaultLevel": "medium"
  },
  "matchHints": {
    "baseUrlKeywords": ["deepseek"],
    "modelKeywords": ["deepseek"]
  },
  "patches": {
    "thinking": {
      "enabled": [
        { "op": "set", "path": "thinking.type", "value": "enabled" },
        {
          "op": "setFromThinkingEffort",
          "path": "reasoning_effort",
          "allowedValues": ["low", "medium", "high"]
        }
      ],
      "disabled": [
        { "op": "set", "path": "thinking.type", "value": "disabled" },
        { "op": "unset", "path": "reasoning_effort" }
      ]
    }
  }
}
```

`matchHints` support recommendation and ordering in settings. Execution is
driven by the provider's selected payload extension and its table-driven
`patches`.

### 3. Main-process plugin host

External plugin loading should go through a dedicated main-process plugin host, for example:

- `src/main/services/plugins/ExternalPluginHost.ts`

Responsibilities:

- scan plugin manifests from allowed folders
- validate manifest schema
- resolve plugin entrypoints
- build capability registry
- surface load errors to renderer

### 4. Separate built-in and external registries

Recommended final shape:

- `builtInPluginRegistry`
- `externalPluginRegistry`
- `pluginCapabilityRegistry`

The capability registry becomes the single lookup layer used by request/tool/runtime code.

### 5. Safety boundaries

External plugins must operate through scoped capability contracts by default.

At minimum the design should include:

- explicit manifest validation
- local-only loading
- scoped capability contracts
- controlled preload/main exposure
- failure isolation and load diagnostics

## Migration Path

Recommended order:

1. keep request adapters built in
2. keep request payload extensions selected on provider definitions
3. add generic capability registry for `request-payload-extension`
4. add external manifest schema and local discovery
5. wire renderer plugin management to installed external manifests

## Short-term Recommendation

Before implementing external plugin execution, the next practical step should be:

1. keep the built-in `RequestPayloadExtensionPipeline` small and table-driven
2. add manifest parsing for `request-payload-extension`
3. list installed payload extensions in the provider selector

That preserves current momentum while keeping the external plugin path coherent.
