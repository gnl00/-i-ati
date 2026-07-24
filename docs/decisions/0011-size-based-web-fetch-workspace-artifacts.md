# ADR-0011: Size-based web fetch workspace artifacts

**Status:** Accepted<br>
**Date:** 2026-07-24<br>
**Related plan:** [Web fetch workspace artifacts](../work/plans/web-fetch-workspace-artifacts.md)<br>
**Related decisions:** [Workspace path confinement](0008-workspace-path-confinement.md), [Background tool-result compaction](0009-background-tool-result-compaction.md)

## Context

Direct web fetches previously decoded a capped response buffer into a
model-visible string. Binary documents could expand into millions of
characters during the active hot continuation; cold replay compaction runs
after this boundary. Response headers are optional and can report an inaccurate
length. Completed on-disk size therefore selects the response route.

## Decision

Every direct HTTP response streams first to a generated part file under the
active chat workspace. The completed file's `stat.size` selects the response
route:

- textual responses at most 3 MiB are parsed and returned inline within a
  tool-specific character budget;
- larger responses and extracted text above the inline budget are promoted to
  `.ati/artifacts/web/<content-hash>/`;
- non-text responses are promoted with their original source and a bounded
  diagnostic sidecar;
- promoted artifacts preserve the source, a readable `content.md`, and
  `metadata.json`;
- response MIME and URL extension classify textual and non-text formats after
  download completion;
- model-visible descriptors expose workspace-relative `sourcePath` and
  `readPath` values and direct the model to a suitable workspace file tool;
- `read` returns at most 32,000 JavaScript characters and provides line and
  column continuation coordinates.

`Content-Length` remains diagnostic metadata. Received stream bytes enforce a
50 MiB download ceiling. Workspace paths pass through
`WorkspacePathResolver`. Artifact publication uses a workspace-local staging
directory and an atomic rename; abandoned spool and staging entries older than
24 hours are removed.

## Consequences

- Large documents remain available to the active model through bounded reads.
- Hot tool results stay compact before provider request construction.
- Small text retains useful inline behavior.
- Non-text files, including PDF, retain their original bytes for downstream
  file tools.
- Direct textual artifacts use canonical `full` cleaning, giving identical
  source bytes a stable readable sidecar across inline modes.
- Search fan-out uses deterministic result-order reservation for inline and
  artifact budgets.
- Web artifacts stay inside tool-managed `.tmp` and `.ati` namespaces.
  Existing tool metadata keeps web calls approval-free; a future metadata
  extension can represent managed artifact writes separately from user-file
  mutation.
- Fetch materialization stays format-agnostic for document parsing. PDF text,
  page count, and OCR belong to the downstream file tool selected by the
  model.

## Verification

- Exercise missing and inaccurate `Content-Length` responses.
- Cover small inline content, the 3 MiB boundary, inline character promotion,
  binary diagnostics, cleanup, aborts, and the 50 MiB hard stop.
- Regress a 7,076,983-byte PDF into a bounded descriptor, raw source artifact,
  and diagnostic sidecar.
- Follow `read` continuation coordinates and reconstruct long UTF-8 text
  exactly.
- Run node type checks, focused Vitest suites, main-process boundary and
  documentation checks, and the Electron production bundle.
