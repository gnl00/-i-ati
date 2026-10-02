# Image display and host delivery

`image_show` presents one image from exactly one `file` or `url`, with an optional
plain-text `caption` (1024 characters). It is distinct from `image_analyze`.
`image_generate` also produces this display payload after generating an image.
See [Image generation](image-generation.md) for its explicit model route and
provider contract. Both tools share snapshot ownership and delivery receipts.

Files use the existing workspace-relative resolver and trusted execution-context
chat UUID. URLs must use HTTP(S), with no embedded credentials. Downloads have a
30-second timeout and a 50 MiB streaming limit. PNG, JPEG, WebP and GIF signatures
and dimensions are checked before publication with the zero-dependency image-size
parser. PNG/JPEG additionally pass Electron native decoding; WebP/GIF remain
in their original format for Chromium display. SVG is excluded.

## Snapshot ownership

Main's `ImageAssetService` stores image bytes in the application profile's
`image-snapshots` directory. The SHA-256 content hash plus detected extension
identifies each image. Publication uses a temporary file and atomic rename.
Source-file edits and URL expiry do not alter the displayed history image.

The desktop `image-asset://snapshot/<assetId>` protocol serves only validated
snapshot IDs, with detected image MIME types. It cannot serve arbitrary paths.
The scheme is registered before Electron readiness and allowed by renderer image
CSP. Snapshots contain no source URL or machine path in their public descriptor.
They are retained with the profile; deleting a chat does not currently garbage
collect shared image bytes. No database schema migration is required.

## One result, separate delivery facts

The canonical `image_show` tool message stores a JSON image descriptor, caption,
and optional Telegram delivery receipt. `ChatRenderOutput` publishes the initial
message and subsequent receipt revisions through existing message-created and
message-updated events. Successful Telegram sends also reuse the existing reply-routing
receipt table so replies to the photo return to its source Chat without changing
the ordinary inbound binding. The renderer uses the persisted tool result for receipts,
with the assistant tool segment as its initial fallback. Images stay visible in
assistant content when Work details collapse, and reuse the shared image viewer.

The tool provides a bounded modelContent string. It describes image preparation,
not Telegram success. Original image bytes never enter the main model transcript;
provider replay also redacts direct image_show file/URL arguments. Transport
receipt updates preserve the original stable modelContent.

```text
image_show -> ImageAssetService -> tool result
  -> ChatRenderOutput: persist and publish image message
  -> TelegramRenderResponder (only for Telegram-origin runs)
       -> persist sending claim through Main's connected result updater
       -> upload the saved bytes to the current peer/topic
       -> persist and publish sent / failed / unknown receipt
  -> Chat UI: same image, current persisted delivery status
```

Telegram receives bytes through grammY InputFile. Photos within size, dimensions
and aspect-ratio limits use sendPhoto; GIFs and images beyond these limits use
sendDocument. A definite Telegram photo-format rejection permits document
fallback. Explicit 429 rejections reuse the shared bounded retry policy. Timeouts
and other uncertain outcomes never trigger another upload and are recorded as
unknown; explicit client errors are failed. Sending failures leave the local image
intact and produce a Telegram text notice when that transport is reachable.

A claim is saved before upload. Existing sending/sent/failed/unknown receipts
prevent a repeated claim for the same chat tool result; per-run tool-call IDs
also suppress repeated render events. A crash after claiming may leave a pending
receipt, which means delivery is unconfirmed. Restart/history hydration displays
persisted facts and does not upload images. A failed success-receipt write never
causes a second upload.

Desktop-origin calls show images locally without broadcasting to bound Telegram
peers. Telegram-origin calls use this run's peer, topic and reply target, including
when the selected source chat differs from ordinary inbound binding. Image
replacement is a new tool call. Preview, zoom, user-side Telegram edits/deletion
and photo/document replacement are not synchronized.

## Verification

Run the image asset/tool, ChatRenderResponder, Telegram runtime and inline image
component suites, Node/web typechecks, both architecture gate families, and full
coverage for the shared host/persistence lifecycle. Check Electron Light/Dark,
normal/narrow windows, custom-protocol loading, image-only completion, preview,
Escape/focus restoration, persisted receipts and source-file replacement.
Live Telegram acceptance must cover photo and document upload, topic routing,
failed delivery and repeated-event suppression separately from stub tests.

Implementation verification (2026-10-01):

- `pnpm test:coverage`: 345 suites passed, 6 skipped; 2409 tests passed,
  22 skipped.
- `pnpm run typecheck`, `pnpm exec electron-vite build` and
  `pnpm run verify:cli` passed.
- `pnpm run check:main-boundaries`, `pnpm run test:main-architecture`,
  `pnpm run check:main-doc-paths`, `pnpm run check:renderer-boundaries`,
  `pnpm run test:renderer-architecture` and
  `pnpm run check:renderer-doc-paths` passed.
- New source files passed scoped ESLint with repository single-quote/no-semicolon
  formatting. Tracked-file comparison retained the existing 123 baseline lint
  errors without introducing additional errors.
- An isolated Electron harness using the real image service and Chat message
  component verified Light/Dark at normal and narrow widths, original GIF/WebP
  loading, collapsed Work details, preview opening, Escape/focus restoration,
  snapshot loading after source-server shutdown and persisted receipt rendering.
  This covers the component/protocol flow; live model-triggered Chat and actual
  Telegram uploads remain manual acceptance gaps.
