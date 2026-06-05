# Request Payload Extensions

Request payload extensions add provider-specific request body fields after a
built-in adapter creates the protocol payload.

They are used for provider/model fields that share one app-level concept while
requiring different upstream JSON shapes. Thinking is the first supported
feature.

## Runtime Order

```txt
IUnifiedRequest
  -> built-in adapter buildRequest
  -> selected request payload extensions
  -> provider requestOverrides
  -> fetch
```

`requestOverrides` are the final manual override layer.

## Provider Selection

Provider definitions store explicit payload extension choices:

```ts
interface ProviderDefinition {
  adapterPluginId: string
  payloadExtensions?: {
    thinking?: string
  }
  requestOverrides?: Record<string, unknown>
}
```

The adapter selector chooses the protocol. The payload extension selector
chooses provider-specific add-on fields.

## Built-in Thinking Extensions

Current built-in thinking extensions:

- `deepseek-thinking`
- `xiaomi-thinking`
- `doubao-thinking`

All three read:

```ts
request.options?.thinking
```

Execution uses table-driven patches declared by the selected extension. The
runtime supports three patch operations:

- `set`: write a literal value to a body path
- `unset`: delete a body path
- `setFromThinkingEffort`: write `request.options.thinking.effort` when it
  matches `allowedValues`

DeepSeek enabled patch result:

```json
{
  "thinking": { "type": "enabled" },
  "reasoning_effort": "high"
}
```

Xiaomi and Doubao enabled patch result:

```json
{
  "thinking": { "type": "enabled" }
}
```

When thinking is disabled, the extension writes:

```json
{
  "thinking": { "type": "disabled" }
}
```

## Manifest Direction

Future local plugins can expose payload extension capabilities:

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

`matchHints` help the settings UI recommend options. Execution follows the
provider definition selection and the selected extension's `patches`.
