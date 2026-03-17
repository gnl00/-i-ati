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

Current built-in plugins focus on `request-adapter` capability:

- `openai-compatible-adapter`
- `claude-compatible-adapter`

Each built-in plugin defines:

- stable plugin id
- display name
- description
- capability kind
- supported provider types
- supported API versions
- supported model types

## Current Flow

1. `src/shared/plugins/builtInRegistry.ts`
   defines the built-in plugin registry.
2. `ConfigDataService`
   normalizes `appConfig.plugins.items` against built-in definitions.
3. `SettingsPanel` and `PluginsManager`
   edit plugin enable/disable state against normalized plugin config.
4. `src/main/request/adapters`
   syncs registered adapters from plugin config before each request.
5. `Providers` settings
   consume the same built-in metadata to disable unavailable adapter choices.

## Why This Shape

This stage deliberately avoids jumping straight to dynamic external plugin loading.

It gives us:

- one metadata source for built-in plugins
- real enable/disable behavior in request execution
- UI and request-layer consistency
- a place to grow capability-based plugin registration

## Next Stage: External Custom Plugins

External plugins should not be modeled as ad-hoc JS files directly loaded into the request pipeline.
They should first be introduced as manifest-driven plugins with explicit capability contracts.

Recommended direction:

### 1. Manifest-first plugin model

Introduce an external plugin manifest concept such as:

```ts
type AppPluginManifest = {
  id: string
  name: string
  version: string
  source: 'local'
  entry: string
  capabilities: PluginCapabilityManifest[]
}
```

This should be loaded from a controlled local directory, not arbitrary remote code.

### 2. Capability-based loading

A plugin should declare one or more capabilities, for example:

- `request-adapter`
- `tool-provider`
- `embedding-provider`
- `renderer-settings-panel`

The runtime should load by capability, not by plugin name.

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

External plugins must not get unrestricted access by default.

At minimum the design should include:

- explicit manifest validation
- local-only loading
- scoped capability contracts
- controlled preload/main exposure
- failure isolation and load diagnostics

## Migration Path

Recommended order:

1. keep growing `builtInPluginRegistry`
2. add generic capability registry
3. add external manifest schema and local discovery
4. add external plugin host in main process
5. wire renderer plugin management to installed external manifests

## Short-term Recommendation

Before implementing external plugin execution, the next practical step should be:

1. introduce a shared `PluginCapability` type
2. let request adapter registration consume capability entries rather than hardcoded request-adapter wrappers
3. add a basic installed-plugin list in settings for local manifests, even if execution is not enabled yet

That preserves current momentum while keeping the external plugin path coherent.
