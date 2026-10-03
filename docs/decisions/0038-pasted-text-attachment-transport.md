# ADR-0038: Pasted text attachments use portable text transport

Status: Accepted
Date: 2026-10-02

## Decision

Present large clipboard text as named `.txt` attachments in the desktop composer.
Retain original clipboard text, ordering and composer text through queues, steering,
message history and regeneration. Main expands attachments into ordinary message text
with a filename and explicit begin/end boundaries before request budgeting.

Persist expanded API-visible `content` and original `composerText` / `textAttachments`
in the existing message JSON. Expanded content is an immutable request snapshot; the
original metadata supports preview, download and regeneration without parsing wrappers.
This duplicates attachment text in storage, but keeps current history import, compression,
copy and budgeting consumers complete without introducing provider-specific history.

Use no upload service or provider file IDs. OpenAI-compatible endpoints cannot be assumed
to accept arbitrary file parameters. Native Responses, Claude or Gemini document transport
can be added only with explicit endpoint/model/MIME support and a complete lifecycle.
Existing `input_file` placeholders are not used for pasted text.

## Consequences

No database migration, additional credentials or network upload lifecycle is required.
All existing text adapters receive full contents, including when the selected model changes.
Attachment conversion does not reduce token consumption or bypass context limits.
Reverting the UI preserves expanded persisted messages as ordinary readable text.

The existing input queue store owns submitted and failed draft snapshots by run identity,
so recovery survives the Welcome/Chat transition without replacing new composer edits.
