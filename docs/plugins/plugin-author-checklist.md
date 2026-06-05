# Plugin Author Checklist

This checklist is for authors building local request payload extension plugins.

Use it together with:

- `docs/plugins/request-payload-extension.md`

Request adapters live in built-in app code. Provider-specific request body
fields use request payload extensions.

## 1. Choose the Right Starting Point

- For provider-specific request body fields, read:
  - `docs/plugins/request-payload-extension.md`

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
  - use one `kind: "request-payload-extension"` capability

## 3. Request Payload Extension Checklist

Make sure the capability declares:

- `kind: "request-payload-extension"`
- `feature: "thinking"`
- optional `thinking.levels`
- optional `thinking.defaultLevel`
- optional `matchHints.baseUrlKeywords`
- optional `matchHints.modelKeywords`
- optional `patches.thinking.enabled`
- optional `patches.thinking.disabled`

Example:

```json
{
  "id": "deepseek-thinking",
  "name": "DeepSeek Thinking",
  "version": "0.1.0",
  "capabilities": [
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
  ]
}
```

## 4. Import and Verification Checklist

After importing from Settings -> Plugins:

- confirm the plugin appears in the plugin list
- confirm version is shown correctly
- confirm the plugin is enabled
- open provider settings and verify the payload extension appears in the payload selector

## 5. Debug Checklist

If the plugin appears installed with an invalid status:

- check that `plugin.json` is valid JSON
- check that `capabilities` contains `request-payload-extension`
- check that `feature` is `thinking`
- check that `thinking.defaultLevel` exists in `thinking.levels`
- check that each patch has an `op` and a non-empty `path`
- rescan installed plugins
