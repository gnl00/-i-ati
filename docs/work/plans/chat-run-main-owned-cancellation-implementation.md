# Chat Run Main-Owned Cancellation Implementation Guide

## Goal

Make the main process the authority for active chat-run identity and cancellation. A renderer HMR update, component remount, or window reload must preserve the ability to stop the active run for the selected chat.

## Confirmed Root Cause

`src/renderer/src/features/chat/runtime/useChatRun.ts` stores each active `submissionId`, renderer `AbortController`, and event subscription in the module-level `activeRuns` map. HMR can recreate that module while the main-process `AgentRun` remains active. The current handle-missing branch resets UI state and returns before invoking `run:cancel`, so the main-process abort signal remains live.

## Chosen Design

The existing main-process `RunRegistry` remains the live-control authority:

```text
ChatInput Stop
  -> run:cancel { chatUuid, submissionId? }
  -> RunService
  -> RunManager
  -> RunRegistry
  -> AgentRun.cancel()
  -> run.aborted
  -> renderer terminal-state projection
```

`AgentRun` continues to own the `AbortController`. `chat_run_events` continues to persist accepted, state, tool, and terminal facts. The chat schema stays unchanged because an `AbortController` is a live process object and the existing event table already records durable run identity and outcome.

## Scope

1. Add a main-owned active-run identity result keyed by `chatUuid`.
2. Extend cancellation so IPC can target an exact `submissionId` or the active run for a `chatUuid`.
3. Make renderer Stop always invoke main cancellation, including when its local handle is absent.
4. Await the IPC result and keep the UI in `cancelling` until a terminal event or the existing timeout policy resolves it.
5. Add regression coverage for the renderer-registry-loss scenario and main lookup/cancellation semantics.
6. Update active architecture documentation with the ownership rule.

## Scope Boundaries

- Keep the current SQLite schema.
- Keep `RunRegistry` in memory because active processes and abort signals share the main-process lifetime.
- Keep existing submission-based callers such as Scheduler and Telegram working.
- Keep renderer `activeRuns` for transient event subscriptions and queue metadata during the current module lifetime.
- Reuse the existing `RUN_CANCEL` channel. Add one read-only active-run query channel only if renderer steering or startup recovery consumes it in this change.
- Avoid a new service, repository, database migration, or dependency.

## API Contracts

### Active run identity

Use a small transport type:

```ts
type ActiveChatRunIdentity = {
  submissionId: string
  chatUuid: string
}
```

Main query semantics:

```ts
getActiveRunForChat(chatUuid: string): ActiveChatRunIdentity | null
```

### Cancellation

Renderer IPC request:

```ts
type RunCancelRequest = {
  submissionId?: string
  chatUuid?: string
  reason?: string
}
```

Main response:

```ts
type RunCancelResult = {
  cancelled: boolean
  submissionId?: string
  reason?: 'run_not_found' | 'chat_mismatch' | 'invalid_request'
}
```

Resolution rules:

1. With `submissionId`, look up the exact run.
2. With both identifiers, require the run's `chatUuid` to match.
3. With `chatUuid` alone, cancel the current active run returned by `RunRegistry.getActiveRunForChat()`.
4. Return `run_not_found` when the target has already reached a terminal state.
5. Return `invalid_request` when both identifiers are absent.
6. Cancel pending tool confirmations and user questions for the resolved submission in every successful path.

These rules protect a newer run from a stale renderer handle while giving an HMR-refreshed renderer a chat-keyed recovery path.

## File-Level Implementation

### Main runtime

- `src/main/orchestration/chat/run/runtime/RunRegistry.ts`
  - Reuse `getActiveRunForChat(chatUuid)`.
  - Add a narrow identity accessor only when it removes `AgentRun` exposure from callers.

- `src/main/orchestration/chat/run/runtime/RunManager.ts`
  - Change `cancel(submissionId)` to return a structured result, or add `cancelActiveRunForChat(chatUuid)` while preserving `cancel(submissionId)` for internal callers.
  - Centralize successful cancellation in one private method so confirmation and question cleanup run once.
  - Add `getActiveRunIdentityForChat(chatUuid)`.

- `src/main/orchestration/chat/run/index.ts`
  - Expose the structured cancellation and active-identity methods through `RunService`.

### IPC and shared transport

- `src/main/ipc/chat.ts`
  - Validate the cancellation request shape.
  - Resolve exact-submission or chat-keyed cancellation through `RunService`.
  - Return the actual cancellation result.
  - Register an active-run query handler when the renderer consumes that query.

- `src/renderer/src/infrastructure/ipc/run.ts`
  - Update `invokeRunCancel` request and response types.
  - Add `invokeActiveRunGet(chatUuid)` only when used by renderer recovery.

- `src/shared/constants/index.ts`
  - Add a query-channel constant only when the query handler is implemented.

Prefer a shared transport module under `src/shared/run/` when the same request/result types appear in both main and renderer. Keep it as a type-only module with no runtime dependencies.

### Renderer

- `src/renderer/src/features/chat/runtime/useChatRun.ts`
  - Make `cancel()` async.
  - Read `currentChatUuid` first.
  - Send `{ submissionId: handle?.submissionId, chatUuid: currentChatUuid, reason: 'user_cancelled' }` on every Stop action.
  - Set `cancelling` around the main acknowledgement path.
  - Preserve the local controller only as a fast local signal for renderer-owned work; main IPC remains the cancellation authority.
  - On `cancelled: false`, restore the previous phase only when the main process reports `run_not_found`; otherwise surface the returned reason through the existing toast system.
  - Keep terminal cleanup driven by `run.aborted` in `chatRunEvent.ts`.

The handle-missing path must invoke IPC before any UI reset.

## Regression Tests

### Main

Extend `src/main/orchestration/chat/run/runtime/__tests__/RunManager.test.ts`:

1. Cancels by exact active submission.
2. Cancels by `chatUuid` after resolving the active submission.
3. Rejects a submission/chat mismatch and leaves the run active.
4. Returns `run_not_found` for an inactive chat.
5. Cancels tool confirmations and user questions with the resolved submission ID.
6. Returns the active identity for a chat and clears it after run completion.

Extend `src/main/ipc/__tests__/chat.test.ts`:

1. `RUN_CANCEL` accepts `{ chatUuid }` and returns the service result.
2. Exact `{ submissionId, chatUuid }` is forwarded intact.
3. Empty cancellation payload returns `invalid_request`.
4. Active-run query registration and result are covered when that channel is added.

### Renderer

Extend `src/renderer/src/features/chat/runtime/__tests__/useChatRun.test.tsx`:

1. Submit a run, clear the renderer registry through the existing test helper to simulate HMR, then call Stop.
2. Assert `invokeRunCancel` receives `{ chatUuid: 'chat-1', reason: 'user_cancelled' }` even with no local handle.
3. Assert the normal path includes both `submissionId` and `chatUuid`.
4. Assert main rejection restores the appropriate phase and reports a warning.
5. Assert successful acknowledgement waits for `run.aborted` to perform final cleanup.

The regression test must fail against the current handle-missing early return and pass after the change.

## Documentation Updates

Update `docs/architecture/chat-submit-event-bus.md`:

- Main owns active-run identity and cancellation.
- Renderer active-run state is a transient projection.
- Stop can resolve the active run by `chatUuid` after renderer lifecycle loss.

Update `docs/architecture/main-process-architecture.md` with the active-run cancellation flow beside active-run steering.

## Verification Commands

Run focused tests first:

```bash
pnpm exec vitest run src/main/orchestration/chat/run/runtime/__tests__/RunManager.test.ts
pnpm exec vitest run src/main/ipc/__tests__/chat.test.ts
pnpm exec vitest run src/renderer/src/features/chat/runtime/__tests__/useChatRun.test.tsx
```

Run boundary and type checks:

```bash
pnpm run typecheck:node
pnpm run typecheck:web
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
pnpm run test:main-architecture
```

## Manual Acceptance Check

1. Start the Electron app in development mode.
2. Start a chat run that performs multiple model/tool cycles.
3. Trigger a renderer HMR update by editing a renderer module and saving it.
4. Return to the running chat and click Stop.
5. Confirm the UI enters `cancelling` once.
6. Confirm the database records `run.aborted` for the active submission.
7. Confirm app logs stop producing model chunks and tool executions for that submission.
8. Confirm a new message can start a fresh run in the same chat.

Pass condition: Stop reaches main and terminates the active run after renderer lifecycle loss.

## Risk and Rollback

The primary risk is cancelling a newer run with stale renderer identity. Requiring identifier agreement when both values are present prevents that case. Chat-only cancellation is reserved for a renderer with no local submission identity.

Rollback consists of reverting the IPC/runtime changes; the database requires no rollback.

## Completion Criteria

- Main is the sole authority for live cancellation.
- HMR registry loss has a passing regression test.
- Existing submission-based cancellation callers continue to pass.
- Terminal `run.aborted` remains the renderer cleanup boundary.
- Focused tests, type checks, and architecture checks pass.
