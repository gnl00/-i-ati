# ADR-0044: Bounded web-fetch concurrency within Agent batches

**Status:** Accepted<br>
**Date:** 2026-10-09<br>
**Related:** [Agent runtime](../architecture/agent-runtime/README.md), [Web tools](../guides/development/web-search-and-fetch.md)

## Context

The three content windows and ToolExecutor already support concurrent fetches.
The dispatcher supplied one call at a time, making ordinary model batches serial.
Parallel IPC measurements demonstrated capacity while leaving chat scheduling,
approval boundaries, result order and cancellation unverified.

## Decision

- Group consecutive `web_fetch` calls with `not_required` confirmation, at most
  three. Reuse the existing executor and progress contract. Settle each group
  before starting the next; keep all other tools and approvals sequential.
- Preserve the user-question barrier and existing deferred-result behavior.
- Publish each grouped call's terminal event at completion, after its own prior
  progress events, once per call. Map final results by ID into original call order.
  Executors without terminal progress use returned results as the fallback.
- Ordinary fetch failures remain independent. Preserve the existing disposition
  of tool-local aborts. Parent cancellation always stops subsequent groups and
  returns ordered partial results after launched calls settle.
- Keep tool schemas, artifact contracts, window count and runtime configuration.

## Consequences

Selected independent pages can use the existing three-window capacity in normal
chat. A slow call holds the next group, which keeps batch boundaries predictable.
This is a narrow scheduling rule; tools with side effects retain their order.
Concurrent cancellation depends on the executor's existing settlement guarantees.
No migration, dependency or new public batch parameter is required.

## Verification

Dispatcher tests cover capacity, group boundaries, real completion order, final
result order, duplicate progress, independent failure, approval/question barriers,
local aborts and parent cancellation. The runtime integration test exercises a
three-fetch batch, ordered artifact references and subsequent artifact reads.

A restarted development app using DeepSeek produced one three-fetch batch for
Python/Electron/Vite; all started within 1 ms and completed in 1,898/3,478/2,894 ms.
The next model round read all three artifacts and produced a final title report.
Automated checks and the performance limits are recorded in the
[optimization plan](../work/plans/web-fetch-phase-timing-optimization.md).
