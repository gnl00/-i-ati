# ADR-0042: Render webpages in Electron for web fetch

**Status:** Accepted<br>
**Date:** 2026-10-09<br>
**Related:** [Web search and fetch](../guides/development/web-search-and-fetch.md), [Stable tool-result model content](0033-stable-tool-result-model-content.md)

## Context

HTTP-first fetching accepted extracted Markdown at 200 characters or an artifact
result. A sufficiently long SPA shell could therefore bypass rendering. Rendering
also fell back to HTTP on navigation/extraction errors, adding another request
without establishing content completeness. Electron already provides reusable
Chromium windows, cancellation and bounded extraction.

## Decision

- Webpages always use the existing content window pool. Delete the HTTP-length
  gate and both directions of webpage HTTP/render fallback.
- Keep direct HTTP for recognizable raw/file URLs and Chromium download responses.
  Downloads retain workspace confinement, byte limits and artifact materialization.
- Keep windows hidden, disable background throttling, and use normal rendering
  instead of offscreen painting. No new browser runtime or dependency is required.
- Wait for nonempty content snapshots to remain stable for 900 ms, with an
  8-second limit. Ignore structural chrome and explicit loading/busy states.
  At the limit, extract usable changing content; reject unresolved loading shells.
- Keep the existing DOM-to-Markdown extractor, result schema, artifact budgets,
  cancellation, window retirement/recycling and overall deadlines.

Search-result auto-fetching is superseded by [ADR-0043](0043-search-discovery-and-explicit-fetch.md).
The rendering decision continues to apply to explicit `web_fetch` calls.

## Consequences

Static webpages also execute scripts and load page resources. They occupy one of
three content windows and have a readiness wait; this can increase latency and
resource use. Fetch behavior is uniform across static and JS-rendered webpages.

A stable snapshot is an observation heuristic, not a completeness guarantee.
Authentication, verification, interaction, infinite scrolling and content outside
the document body remain separate browser capabilities. Rendering errors now
return directly rather than retrieving a different HTTP representation.

No persisted-data or public-parameter migration is required. The routing change
can be reverted without modifying saved workspace artifacts.

## Verification

Cover rendered short/async content, loading shells, empty and blocked pages,
file downloads including extensionless attachments, failure without HTTP fallback,
cancellation, hung renderers and capacity restoration. Run web-tool suites, Node
typecheck, changed-file lint, main architecture/doc checks and full coverage.
Validate rendering/download/cancellation with an isolated Electron process and
local HTTP fixtures, separate from installed-app/provider acceptance.
