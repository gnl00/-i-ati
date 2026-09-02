# Chat streaming performance P1/P2 implementation guide

Status: Implemented; automated verification complete; runtime profiling pending
Owner: Renderer maintainers
Date: 2026-09-02
Baseline commit: `cbb93d1a399c2cf42bd9a16432c8dab51b4c5773`

## 1. Goal

Reduce renderer work during assistant streaming in the current 8-turn, 62-tool-result conversation while preserving run lifecycle, transcript presentation, scrolling, grouping, and input behavior.

The work is split into three independently mergeable packages:

1. P1 isolates high-frequency chat-store subscriptions.
2. P2-A applies one preview patch batch with one segment-array update.
3. P2-B reuses the stable assistant projection prefix and rebuilds only the affected suffix.

`tools.streamChunkDebugEnabled` remains under the existing user-controlled toggle. Before/after runtime measurements use the same toggle value so the comparison remains valid.

## 2. Current evidence

### P1 subscription fan-out

`useChatRun()` currently calls `useChatStore()` without a selector. The hook is mounted by `ChatInputArea` and by every `AssistantMessageContainer`, so any root chat-store update can schedule those consumers.

`ChatInputActions` also combines a precise `messages` selector with a second whole-store subscription for chat identity, chat list, and actions.

### P2 repeated segment work

`applyPreviewSegmentPatches()` reduces a batch through `applyMessageSegmentPatchToEntity()`. Each patch performs identity lookup, copies the segment array, and creates a new message body.

`mapAssistantMessage()` rebuilds committed items, preview items, text/support lanes, and support grouping whenever the preview message changes. Unchanged segment references are already preserved by `messagePatch.ts`, which provides the identity needed for safe prefix reuse.

## 3. Shared constraints

- Preserve `RunRegistry`, cancellation, steering, background title events, and post-run behavior.
- Preserve message, segment, tool-call, and completed-work ordering and keys.
- Preserve preview-to-committed identity and current memo equality contracts.
- Preserve Chat Window scroll ownership and Message Scroller behavior.
- Keep Zustand as the canonical message state. Projection caches remain local to the Renderer component tree.
- Keep schema, IPC contracts, configuration, persisted state, and dependencies unchanged.
- Keep `streamChunkDebugEnabled` behavior and current value unchanged.
- Each work package owns disjoint implementation files and tests.

## 4. P1: isolate high-frequency subscriptions

### Files

- `src/renderer/src/features/chat/runtime/useChatRun.ts`
- `src/renderer/src/features/chat/runtime/__tests__/useChatRun.test.tsx`
- `src/renderer/src/features/chat/input/ChatInputActions.tsx`
- `src/renderer/src/features/chat/input/__tests__/ChatInputActions.performance.test.tsx`

### Implementation

1. Remove the selector-free `useChatStore()` subscription from `useChatRun()`.
2. Read the latest store through `useChatStore.getState()` when `onSubmit`, `cancel`, or `steer` is invoked.
3. Pass stable store actions to `bindChatRunEvents`; event-time state checks continue through current `getState()` paths.
4. Replace the whole-store subscription in `ChatInputActions` with one selector per required state value or action.
5. Keep `runPhase` reactive because it controls the visible submit/cancel state.
6. Keep `ChatImageGallery` outside this package. It is mounted only while composer media exists and leaves the streaming surface after submission.

### Tests

- A `useChatRun` consumer does not render when only `preview.message` changes.
- A consumer rendered before chat/model changes uses the latest chat UUID, chat ID, model reference, instruction, and permission mode when submitting.
- Cancellation and steering still resolve the latest active chat.
- `ChatInputActions` does not render for a preview-only update.
- `ChatInputActions` still updates for message count, current chat identity, chat-list workspace, and run-phase changes.

### Exit criteria

- Selector-free `useChatStore()` calls are absent from `useChatRun.ts` and `ChatInputActions.tsx`.
- Preview-only changes produce zero update commits in their render-count tests.
- Existing run lifecycle tests pass.

## 5. P2-A: apply a patch batch once

### Files

- `src/shared/run/messagePatch.ts`
- `src/shared/run/__tests__/messagePatch.batch.test.ts`
- `src/renderer/src/features/chat/state/chatTranscriptStore.ts`
- `src/renderer/src/features/chat/state/__tests__/chatMessagePatch.test.ts`

### Implementation

1. Add one shared batch helper that applies `MessageSegmentPatch[]` to a message entity.
2. Copy the current segment array once and build an identity-to-index map once for the active batch state.
3. Apply patches in input order so `replaceSegments`, appended segments, repeated identities, content, tool calls, and `typewriterCompleted` retain sequential semantics.
4. Reuse unchanged segment objects and stable tool-call arrays through the existing equality helpers.
5. Create the resulting entity and body once per batch.
6. Route both visible-chat and buffered-chat batch actions through the shared helper.
7. Keep the single-patch helpers intact for their current callers.

### Tests

Use differential tests: compare the batch helper with sequential application through `applyMessageSegmentPatchToEntity()`.

Cover:

- append-only patches;
- two updates to the same segment identity;
- mixed text, reasoning, tool-call, and error segments;
- `replaceSegments` followed by updates and appends;
- content, toolCalls, and `typewriterCompleted` metadata;
- unchanged segment reference preservation;
- visible and buffered chat transcript actions.

### Exit criteria

- One batch creates one final message/body/segment-array result.
- Batch and sequential outputs are deeply equal across the covered cases.
- Unchanged segment references remain stable.

## 6. P2-B: incremental assistant projection

### Files

- `src/renderer/src/features/chat/message/assistant-message/model/assistantMessageMapper.ts`
- `src/renderer/src/features/chat/message/assistant-message/model/assistantMessageProjectionCache.ts`
- `src/renderer/src/features/chat/message/assistant-message/AssistantMessageContainer.tsx`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageProjectionCache.test.ts`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageRenderModel.test.ts`

### Implementation

1. Keep `mapAssistantMessage()` as the complete reference projection and fallback.
2. Add a pure incremental projector that accepts the previous cache snapshot, the next message source, and the mapper context.
3. Compare segment identity and object reference to find the first changed segment.
4. Move the invalidation point back to the nearest preceding visible text boundary. This preserves completed-work window semantics when reasoning or tool calls change near a boundary.
5. Reuse text items, support items, and support units before the invalidation point.
6. Rebuild the suffix through the same mapping and grouping rules used by the complete projector.
7. Use the complete projector when segments shrink, reorder, change transcript visibility, lose stable identity, switch preview/committed layers, or transition streaming state in a way that changes tail semantics.
8. Store the cache snapshot in `AssistantMessageContainer` with `useRef`. Reset it when the message identity changes.
9. Keep provider/model header resolution responsive to account and provider-definition changes.
10. Keep Zustand free of projection state.

### Tests

Every incremental result must match `mapAssistantMessage()` for:

- a 62-tool completed prefix followed by appended answer text;
- running tool updates to completed and failed;
- consecutive reasoning merge changes;
- a new visible text boundary closing completed work;
- hidden transcript segments;
- error segments that keep their standalone grouping;
- preview-to-committed transition;
- segment deletion, replacement, and reorder fallback;
- provider/account and streaming-context changes;
- stable object reuse before the invalidated suffix.

### Exit criteria

- Incremental and complete projection outputs are equivalent for all covered transitions.
- Sealed prefix render objects retain identity during append-only tail updates.
- Completion and reorder paths use the complete fallback and preserve current keys.

## 7. Verification

Run from the repository root:

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run \
  src/renderer/src/features/chat/runtime/__tests__/useChatRun.test.tsx \
  src/renderer/src/features/chat/input/__tests__/ChatInputActions.performance.test.tsx \
  src/shared/run/__tests__/messagePatch.batch.test.ts \
  src/renderer/src/features/chat/state/__tests__/chatMessagePatch.test.ts \
  src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageProjectionCache.test.ts \
  src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageRenderModel.test.ts
pnpm_config_verify_deps_before_run=false pnpm run typecheck:web
pnpm_config_verify_deps_before_run=false pnpm run check:renderer-boundaries
pnpm_config_verify_deps_before_run=false pnpm run check:renderer-doc-paths
pnpm_config_verify_deps_before_run=false pnpm run test:renderer-architecture
git diff --check
```

Run the nearest existing lifecycle, preview batching, assistant rendering, and support-grouping suites when a touched contract is shared with them.

## 8. Runtime acceptance

Use the same development instance, current 8-turn conversation, 62 tool results, and unchanged `streamChunkDebugEnabled` setting for both captures.

1. Record React Profiler and DevTools Performance for one comparable streamed response before and after the integrated change.
2. Confirm historical Assistant rows and `ChatInputActions` have zero preview-only commits.
3. Confirm the latest Assistant produces at most one React commit per preview batch flush.
4. Confirm React commit P95 is below 8 ms and the checked stream contains no main-thread task above 50 ms attributable to rendering.
5. Confirm the batch helper output count matches preview batch flush behavior.
6. Confirm projection self-time falls by at least 50% on the 62-tool transcript fixture or remains below 2 ms P95.
7. Exercise submit, cancel, steer, regenerate, branch, search jump, manual scrolling, tail follow, and jump-to-latest.

## 9. Failure handling and rollback

- P1 rollback restores the two selector-free subscriptions and leaves P2 intact.
- P2-A rollback returns batch actions to sequential patch application and leaves the projection cache intact.
- P2-B rollback removes the component-local cache and routes every render through `mapAssistantMessage()`.
- Every rollback is renderer/shared-code only and requires no data migration.

## 10. Completion record

Implemented files:

- P1: `useChatRun.ts`, `useChatRun.test.tsx`, `ChatInputActions.tsx`, and `ChatInputActions.performance.test.tsx`.
- P2-A: `messagePatch.ts`, `messagePatch.batch.test.ts`, `chatTranscriptStore.ts`, and `chatMessagePatch.test.ts`.
- P2-B: `assistantMessageMapper.ts`, `assistantMessageProjectionCache.ts`, `AssistantMessageContainer.tsx`, and `assistantMessageProjectionCache.test.ts`.
- Documentation: this guide, `docs/README.md`, and `docs/guides/README.md`.

Implementation details:

- P1 reads the current run submission state at invocation time and subscribes input actions only to the state slices they render.
- P2-A builds one identity index and one segment-array result for each preview patch batch while retaining sequential patch semantics.
- P2-B keeps the complete mapper as its reference path, reuses stable projection prefixes, and publishes the component-local cache during React's layout commit phase.
- `tools.streamChunkDebugEnabled` remains under the existing toggle with its current value unchanged.

Automated verification on 2026-09-02:

- Focused P1/P2 suites: 6 files and 66 tests passed.
- Nearby chat streaming, batching, rendering, and performance suites: 26 files and 164 tests passed.
- Full Vitest suite: 291 files passed, 3 skipped; 1,795 tests passed, 13 skipped.
- `typecheck:web`, `check:renderer-boundaries`, `check:renderer-doc-paths`, `test:renderer-architecture`, and `git diff --check` passed.

Real-environment acceptance remains open for the before/after React Profiler and DevTools Performance capture described in section 8. Automated tests establish behavior and reference reuse; the live capture establishes commit timing, long-task attribution, and P95 targets on the current development conversation.
