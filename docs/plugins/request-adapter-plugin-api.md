# Request Adapter Plugin API

Status: retired for external plugins.

Request adapters are built into the app. Provider protocol implementations live
under:

- `src/main/request/adapters`

Current built-in adapters:

- `openai-chat-compatible-adapter`
- `openai-responses-compatible-adapter`
- `openai-image-compatible-adapter`
- `claude-compatible-adapter`
- `google-gemini-compatible-adapter`

External plugins should target request payload extensions for provider-specific
request body add-ons.

Read:

- `docs/plugins/request-payload-extension.md`
- `docs/plugins/plugin-author-checklist.md`

Runtime request order:

```txt
IUnifiedRequest
  -> built-in adapter buildRequest
  -> selected request payload extensions
  -> provider requestOverrides
  -> fetch
```

`adapterPluginId` selects a built-in adapter. Local and remote plugins are
loaded as plugin metadata and future payload-extension capabilities.
