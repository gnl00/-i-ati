# ADR-0037: Main-owned image snapshots and host delivery receipts

Status: Accepted
Date: 2026-10-01

## Decision

Add image_show for presenting one file or URL image. Main snapshots immutable
image bytes in profile storage and persists a descriptor in the existing tool
message. Chat and Telegram consume the same result. Desktop-origin calls stay
local; Telegram-origin runs upload to their current peer/topic.

The Chat host remains the canonical persistence consumer. Transport responders
connect to a Main-owned tool-result updater for receipt writes and UI events.
Persist a claim before upload and a receipt after it. Existing claims and receipts
suppress duplicate sends; uncertain delivery does not cause automatic re-upload.
Image preparation and Telegram delivery are separate facts. Receipt changes do
not rewrite the stable modelContent or send image bytes to the main model.

## Consequences

Reuse existing tool messages and revision-aware renderer ingress without new
schema tables or migrations. A confined custom protocol serves immutable snapshots.
Chat history survives source edits and URL expiry. A crash or receipt-write failure
can leave an unconfirmed claim; exact-once delivery cannot be guaranteed by the
Telegram API. Prefer visible uncertainty over duplicate uploads.

Snapshots remain in the application profile; chat deletion does not yet collect
shared assets. User-side Telegram deletion, caption edits, media replacement and
local viewer interactions do not change the canonical image result.

See [Image display architecture](../architecture/image-display.md).
