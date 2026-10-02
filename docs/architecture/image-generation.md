# Image generation

`image_generate` generates and displays one image from a required text `prompt`
(up to 16000 characters) and optional plain-text `caption` (1024 characters).
The first version uses the existing OpenAI Image Compatible adapter:
`POST /images/generations`, `n: 1`, and `size: 1024x1024`. Reference images,
editing, batches, streaming, and provider-specific generation options are outside
this contract. Provider chat payload extensions and request overrides are not
applied to generation, preserving the single-image request.

## Explicit model routing

`tools.imageGenModel` is an optional `{ accountId, modelId }` reference saved by
Settings → Tools → Model Routing → Image Gen Model. Configure an enabled model
with type `img_gen` under a provider using the OpenAI Image Compatible adapter.
The selector uses the same model options as Main/Lite/Vision and filters only
for enabled models of type `img_gen`. Adapter and plugin compatibility are
validated when the generation tool runs, rather than restricting selection.
Fetched `gpt-image` model IDs are classified as `img_gen`; model type can also be
set manually in Providers.

When no compatible model is available, the routing row shows
`No image models available` beside an `Add model` button. The button opens the
Providers tab in the same Settings panel. The empty state uses plain status text
rather than a disabled selector-shaped field.

Old configurations have no image route. The tool remains registered regardless
of configuration, so a call can return setup guidance. There is no fallback to
Main Model or the first available generation model. Missing configuration returns
`IMAGE_GEN_MODEL_NOT_CONFIGURED`; a deleted, disabled, or incompatible route
returns `IMAGE_GEN_MODEL_UNAVAILABLE`, before generation dispatch. Provider
model deletion/disable cleanup follows the existing model-routing lifecycle.
Plugin enablement is checked again at execution and by unified request dispatch.

## Generation and publication

```text
image_generate -> explicit route validation -> unified non-streaming request
  -> OpenAI Image Compatible adapter -> one URL or b64_json image
  -> ImageAssetService -> immutable image snapshot
  -> ChatRenderOutput -> persisted image result -> Chat UI
  -> TelegramRenderResponder (Telegram-origin runs only)
```

The processor accepts exactly one returned image. Base64 output is bounded
before decoding; URL downloads and decoded bytes reuse the same image size,
format, dimensions, native decoding, cancellation, and atomic publication checks
as `image_show`. `prepareBytes` is a Main-only service method, with no new IPC
or model-facing raw-byte input.

The tool name remains `image_generate`. Its successful payload uses the existing
`ImageShowResult` with `kind: 'image_show'`, which identifies the display payload,
not the generation action. Both image tools use the existing persistence,
collapsed-work inline display, preview, and Telegram receipt protocol documented
in [Image display](image-display.md). A second `image_show` call is unnecessary.
The bounded model view contains success, asset ID, caption and model ID; it
excludes image bytes, provider URLs, credentials, and filesystem paths.

The overall generation/publication timeout is 180 seconds, while URL downloads
retain their 30-second limit. Cancellation aborts the provider request and
publication; invalid responses and snapshot failures return bounded error
messages. No automatic generation retry occurs. A cancelled or timed-out request
may already have been processed by the provider. Telegram receipt retries retain
the separate delivery policy and never repeat image generation.

## Verification

Run the image generator and image asset tests, tool definition/registration tests,
provider inference/routing tests, Chat persistence and Telegram image delivery
tests, and inline image component tests. Run both typechecks, scoped ESLint,
both architecture gate families, and `pnpm test:coverage` for the shared
persistence/render lifecycle. Check Settings routing and generated image display
in Electron Light/Dark at normal and narrow widths, including selection, clear,
history hydration and preview. A local provider stub verifies request/response
transport; live provider generation and live Telegram delivery are separate
acceptance checks.

Implementation verification (2026-10-02):

- `pnpm test:coverage --coverage.reportsDirectory=/private/tmp/ati-image-gen-coverage`
  passed: 348 suites passed, 6 skipped; 2453 tests passed, 22 skipped. The
  isolated output directory avoids concurrent coverage runs overwriting files.
- `pnpm run typecheck`, `pnpm exec electron-vite build`, both
  `check:*-boundaries`, both `test:*-architecture`, and both
  `check:*-doc-paths` passed.
- Scoped ESLint retained the existing findings in affected files; the change
  introduced no new lint errors. Formatting checks used repository single-quote
  and no-semicolon conventions.
- An isolated Electron 44.5.0 harness verified the actual generation processor,
  unified request, adapter, snapshot service, Settings model selector and Chat
  image components against a local HTTP generation fixture. Light/Dark at
  1000px and 420px passed, including explicit selection, route persistence,
  clear, empty state, image-only completion, collapsed Work details, protocol
  loading after the fixture server stopped, preview and focus restoration.
  The generation request occurred once with the selected model, one image and
  the fixed size. The renderer reported no errors.
- Actual provider billing/generation, full model-triggered Chat execution,
  profile-backed Settings persistence, and live Telegram delivery remain manual
  acceptance gaps; the harness uses isolated configuration persistence and the
  delivery tests use Telegram stubs.
