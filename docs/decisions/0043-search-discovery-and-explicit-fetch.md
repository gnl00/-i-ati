# ADR-0043: Search discovers sources; fetch reads selected URLs

**Status:** Accepted<br>
**Date:** 2026-10-09<br>
**Related:** [Web search and fetch](../guides/development/web-search-and-fetch.md), [Electron-rendered fetch](0042-electron-rendered-web-fetch.md)

## Context

Search descriptions and the built-in search skill recommended snippet discovery,
but omitting the mode flag still fetched every selected result's body. With
Electron-rendered webpages, that consumed content-window capacity and returned
body content for sources the agent had not selected. The same fetch capability
was already available through `web_fetch`.

## Decision

- `web_search(query, engine?)` always returns discovery metadata: result query,
  success, title, snippet and link. Keep result-count configuration/internal IPC
  input, engine selection, quality gates, ordering, deduplication, cancellation,
  deadlines and Google verification behavior.
- Remove `snippetsOnly` from the model definition, shared arguments, IPC and
  orchestration. Remove source-body content, artifact and content-status fields
  from newly produced search results.
- Remove automatic source loading, scrape concurrency, per-item fetch timeout,
  aggregate inline limits and ordered artifact reservations. The fetch
  materializer no longer accepts search-specific budget callbacks.
- Agents call `web_fetch` explicitly for selected URLs. Keep its Electron rendering,
  file-download routing, extraction, inline budgets, artifacts and recovery paths.
- Update the built-in search skill to discover first, then fetch sources when
  evidence beyond excerpts is needed.

## Consequences

Search completes without fetching destination page bodies. Source selection is
visible as subsequent fetch calls. A task requiring bodies performs more explicit
tool calls while reading only selected sources.

This changes the tool and IPC output contracts. All in-repository declarations
and consumers are updated together; external callers should stop supplying the
removed mode flag and obtain body content through `web_fetch`. Existing persisted
raw/model tool results stay intact and require no database migration. No new
compatibility adapter, backend, dependency, configuration or reference registry is
introduced.

## Verification

Assert search metadata without content-window acquisition, HTTP source fetches
or workspace writes; preserve source selection/quality-gate/cancellation tests.
Exercise explicit fetch of one selected result. Run web-tool/skill/IPC suites,
Node and web typechecks, changed-file lint, main/renderer architecture checks,
documentation path checks and full coverage. Use isolated Electron local fixtures
to distinguish search-page navigation from selected-source fetches.
