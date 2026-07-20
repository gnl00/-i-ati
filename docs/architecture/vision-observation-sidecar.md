# Vision Observation Sidecar

## Goal

Image turns should work with every host that enters the main run pipeline. Desktop chat, Telegram, and future hosts can pass media through `MainAgentRunInput.input.mediaCtx`; the shared run preparation layer turns those media parts into a textual vision observation before the MainAgent request is built.

The MainAgent keeps using the chat-selected model. Vision-specific work uses the configured vision model and produces a hidden observation message that is reusable by later follow-up turns.

## Phase 1 Scope

- Run a `VisionObservationService` during chat preparation when `mediaCtx` contains images.
- Resolve the configured `visionModel` and execute a non-streaming multimodal request with the current user text and images.
- Persist a hidden `VISION_OBSERVATION` message in the same chat after the visible image user message.
- Include the hidden observation in the MainAgent request context.
- Keep raw image user messages persisted for UI display, export, and future reinspection.
- Prevent raw historical images from reaching text-only MainAgent requests.
- Preserve `chat.modelRef` as the chat-selected model.

## Phase 2A Vision Tool Scope

- MainAgent uses `vision_analyze` for current or historical image inspection.
- Raw image content remains on persisted user messages as `image_url` VLMContent.
- MainAgent provider payload strips raw image parts through `RequestMaterializer`.
- MainAgent receives only a volatile `<available_images>` context with refs computed from the compressed effective message window.
- Compression-covered image messages disappear from `<available_images>` automatically.
- The tool receives runtime-owned `chat_uuid` from `ToolExecutor.applyRuntimeContext()` and validates refs against the current chat.
- The tool prompt is passed directly to the vision model as the visual task.

## Later Scope

- Render hidden observations in diagnostics or debug views.
- Deduplicate observations for repeated media.

## Pipeline

```text
Host adapter
  -> MainAgentRunInput { textCtx, mediaCtx, source, host }
  -> RunEnvironmentService
       emit CHAT_READY and existing history before any new turn message
  -> StepBootstrapService
       save visible user message with image_url content when an image is present
       emit the visible user message immediately after persistence
       run VisionObservationService when mediaCtx has images
       save hidden VISION_OBSERVATION message
  -> RunRequestFactory
       RequestMessageBuilder shapes canonical seed history
       AvailableImagesContextProvider injects <available_images> refs from the compressed message window
  -> InitialTranscriptSeedBuilder
  -> Runtime transcript
  -> RequestMaterializer
       strips raw input_image parts for MainAgent provider requests
       keeps hidden vision_observation text and available_images refs
  -> MainAgent model request
       may call vision_analyze({ images: [{ ref }], prompt })
  -> VisionToolsProcessor
       resolves refs inside current chat scope and calls the configured vision model
```

## Phase 1 Implementation Notes

- `MESSAGE_SOURCE.VISION_OBSERVATION` is registered as a hidden message source.
- `ChatStepStore.createUserMessage()` persists `image_url` content whenever `mediaCtx` has images, independent of the selected chat model type.
- `ChatPreparationPipeline.prepare()` emits `CHAT_READY` and existing history before bootstrapping the new step. This gives new chats a shell before any `MESSAGE_CREATED` event is sent.
- `StepBootstrapService.bootstrap()` is asynchronous. It saves the visible user message first, emits that message immediately, then calls `VisionObservationService` and appends the hidden observation to the current `messageBuffer`.
- `ChatAgentAdapter.prepareRun()` emits created messages that were produced after early preparation events. `earlyEmittedMessageIds` prevents the visible user message from being sent twice while still allowing hidden `VISION_OBSERVATION` messages to be emitted after observation completes.
- `VisionObservationService` resolves `tools.visionModel` through `resolveVisionModelRef()`, resolves provider/account/model context through `ChatModelContextResolver`, and sends a non-streaming `createUnifiedRequest()` + `unifiedChatRequest()` multimodal request.
- MainAgent still receives the chat-selected model through `modelRef` and `chatModelRef`. Telegram and desktop hosts pass media through `MainAgentRunInput.input.mediaCtx`.
- `RequestMaterializer` removes `input_image` parts from provider-facing MainAgent user messages. Hidden vision observation text stays in the materialized request.

## Message Shape

`MESSAGE_SOURCE.VISION_OBSERVATION` is hidden and persisted as a user message:

```xml
<vision_observation image_ref="message:123" status="ok">
Summary:
...

Details:
...

OCR:
...
</vision_observation>
```

Failure uses the same source with `status="failed"`:

```xml
<vision_observation image_ref="message:123" status="failed">
Vision observation failed: ...
</vision_observation>
```

## Service Contract

`VisionObservationService.observe(input)` receives:

- `chat`: the current chat entity.
- `userMessage`: the visible user message entity that contains image content.
- `textCtx`: the current user text.
- `mediaCtx`: normalized image data URLs.
- `source` and `host`: host metadata for traceability.

It returns a `MessageEntity` ready to include in the current `messageBuffer`.

The service uses:

- `resolveVisionModelRef(config)` for model selection.
- `ChatModelContextResolver` for provider/account/model details.
- `createUnifiedRequest` and `unifiedChatRequest` for the multimodal request.
- `resolveRequestOverrides(providerOverrides, 'chat')` when available request-kind compatibility is needed.

## Error Handling

Vision observation failures create a hidden failed observation message. MainAgent receives that failure context and can answer with a clear limitation while preserving the user turn.

Missing or unavailable vision model creates a failed observation message with a stable reason. The visible user message remains saved.

## MainAgent Image Handling

MainAgent requests consume text and hidden observations. Raw `input_image` parts are stripped during provider-facing materialization for MainAgent requests. This protects text-only chat models after image turns while keeping the original image in persisted history.

## Image Refs

`<available_images>` is generated by `AvailableImagesContextProvider` after compression is resolved:

```xml
<available_images>
Use these refs with vision_analyze when the user asks to inspect a current or historical image. The raw image data stays outside the MainAgent request.
  <image ref="message:101#image:1" message_ref="message:101" image_index="1" user_text="invoice screenshot" />
</available_images>
```

Ref rules:

- `message:101#image:1` selects the first `image_url` part in message `101`.
- `message:101` expands to every `image_url` part in message `101`.
- Image ordinals are 1-based and count only `image_url` parts.
- `vision_analyze` accepts `images: [{ ref | url | raw_data }]` and `prompt`.

`vision_analyze` returns one plain text result for the requested image set, plus a sanitized image source summary. Explicit tool calls wait up to 60 seconds by default and accept `timeout_seconds`, clamped from 5 to 120 seconds. Sidecar observations keep the shared vision request default of 20 seconds. Errors redact data URLs, long base64 payloads, authorization headers, API keys, bearer tokens, and signed URL credential fields before returning to MainAgent. Provider-facing replay of `vision_analyze` assistant tool-call arguments also redacts direct `url` and `raw_data` values.

## Tests

- `VisionObservationService` success maps images and user text into a non-streaming multimodal request and persists an observation.
- `VisionObservationService` failure persists a failed hidden observation.
- `StepBootstrapService` adds visible user message plus hidden observation when `mediaCtx` has images.
- `RequestMaterializer` strips `input_image` parts and preserves observation text in MainAgent requests.
- `AvailableImagesContextProvider` rebuilds `<available_images>` from the compressed surviving message window, emits 1-based refs for multi-image messages, and excludes hidden messages.
- `ImageRefResolver` expands whole-message refs, resolves one-based image refs, checks `chat_uuid`, and reports missing or out-of-range refs.
- `VisionToolsProcessor` accepts `images` plus a direct prompt, then calls the shared vision request service.
- `VisionToolsProcessor` sends a 60 second default timeout and clamps `timeout_seconds` from 5 to 120 seconds.
- `ToolExecutor` forces `vision_analyze` to use the runtime chat UUID even when model-supplied arguments include `chat_uuid`.
- `RequestMaterializer` redacts direct vision image arguments before provider-facing assistant tool-call replay.
- Desktop chat and Telegram media tests assert `modelRef` and `chatModelRef` stay on the chat-selected model; vision model usage is scoped to `VisionObservationService`.
- `RequestMessageBuilder` and `InitialTranscriptSeedBuilder` keep hidden observation messages available to runtime history.

Implemented Phase 1 coverage:

- `src/main/hosts/chat/vision/__tests__/VisionObservationService.test.ts`
- `src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts`
- `src/main/hosts/chat/preparation/request/__tests__/InitialTranscriptSeedBuilder.test.ts`
- `src/main/agent/runtime/transcript/__tests__/RequestMaterializer.test.ts`
- `src/main/hosts/chat/persistence/__tests__/ChatStepStore.test.ts`
- `src/main/services/telegram/__tests__/TelegramGatewayService.test.ts`

## Verification Commands

```bash
pnpm exec vitest run \
  src/main/hosts/chat/vision/__tests__/VisionObservationService.test.ts \
  src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts \
  src/main/hosts/chat/preparation/request/__tests__/InitialTranscriptSeedBuilder.test.ts \
  src/main/agent/runtime/transcript/__tests__/RequestMaterializer.test.ts \
  src/main/services/telegram/__tests__/TelegramGatewayService.test.ts

pnpm run typecheck
```
