# Chat history first-paint optimization

Status: Implemented; automated gates passed; development-window acceptance recorded
Owner: Renderer maintainers
Date: 2026-09-02
Baseline: `15eccb61`

## 1. Goal and evidence

Opening a historical chat from Welcome must keep meaningful content or an explicit loading state visible until the transcript is ready. Historical messages render immediately at their initial visible state. Fresh message playback retains its existing behavior.

The current development investigation used 577 list entries and a chat containing 70 stored messages (646,554 JSON characters), of which 8 are visible transcript items. A renderer reload followed by first selection measured:

| Milestone | Time after click |
| --- | ---: |
| Messages restored to store | 543.6 ms |
| Welcome exiting; transcript absent | 617.7 ms |
| Transcript DOM present | 1,338.5 ms |
| Follow-up scroll correction | 1,439.8 ms |

A separate DevTools recording captured a blank body at about 1.2 seconds, the composer at 1.63 seconds, and visible text at 1.83 seconds. Its click task lasted 415 ms, including about 154 ms of ChatTitleList construction and 86 ms of forced style recalculation. A later transcript mount task lasted 662 ms, including about 176 ms of Markdown work and a user-message height read triggering about 63 ms of style recalculation. The lightweight probe recorded a 525 ms transcript task. These recordings have different instrumentation overhead and are separate samples.

Five warm read-only IPC samples fetched 70 messages in 4.9–10.9 ms; chat metadata took 0.1–0.5 ms. DevTools and React development instrumentation amplify the measured CPU cost. Process-cold startup and production-build timings require separate acceptance.

## 2. Scope and invariant contracts

Three independently useful work packages implement the approved optimization. The aggregate touches more than eight implementation/test files. They preserve the existing design tokens, composer layout, message identity, MessageScroller registry, stream playback, search, branch, tool disclosures, and per-chat run state.

The dependency flow remains:

```text
ChatSheet selection
  -> transient loading feedback -> ChatWindow retained surface
  -> workspace check -> hydrateChat -> current transcript
                                      -> ChatTranscriptScroller registry
                                         -> visible/visited message bodies
                                            -> Markdown and measurements
```

Excluded: database pagination, schema migrations, IPC changes, dependency changes, global animation removal, generic cache services, scroller replacement, persisted diagnostic state, and changes to `tools.streamChunkDebugEnabled`. No new credentials or external service are required. This task ends with verified workspace changes; commit and push remain separate user actions.

## 3. Package A: history visibility and Welcome transition

Owner: Luna Max A.

Owned implementation: `src/renderer/src/features/chat/shell/ChatWindow.tsx`, assistant-message presentation files under `src/renderer/src/features/chat/message/assistant-message/`, and their focused tests. The root agent owns documentation. Package A leaves ChatTranscriptScroller, ChatSheet, sheetStore, chatCoordinatorStore, and user-message files to their designated owners.

1. Render a loaded historical transcript directly on the render that receives it. Separate history hydration from the pending first user submission. Use existing pending/run/scroll intent as appropriate; a consumed scroll hint alone must never re-enable a history entrance animation.
2. Keep the current Welcome-to-first-submission animation for a genuinely new user turn. Clean up its timer on unmount and invalidation so a delayed callback cannot hide a subsequent Welcome or another conversation.
3. Consume `useSheetStore(state => state.chatLoading)` from Package B. While loading, retain the previous content or Welcome and add a small non-blocking `role="status"` / polite loading indicator using existing semantic colors. Keep composer layout stable. Clear feedback on successful completion and on failure.
4. Make historical assistant text initially visible. Add the smallest presentation parameter necessary to distinguish live text entrance from history. Existing code-bearing TextSegment currently starts transparent even for committed history; cover that branch explicitly. The latest historical assistant shell must also skip its 400 ms entrance animation. Preserve fresh incoming/preview playback, reasoning/tool disclosure behavior, and reduced-motion semantics.
5. Keep new flags local to rendering contracts; leave persisted ChatMessage and MessageEntity unchanged.

Tests: history from Welcome mounts without advancing the 220 ms timer; new submission retains its animation; stale timers after reset/unmount do nothing; loading preserves meaningful content; code-containing history starts opaque; latest historical assistant skips shell animation; live preview retains intended animation/playback.

## 4. Package B: list render isolation and loading ownership

Owner: Luna Max B.

Owned implementation: `src/renderer/src/features/chat/shell/ChatSheet.tsx`, `src/renderer/src/features/chat/title/ChatTitleList.tsx`, `src/renderer/src/features/chat/state/sheetStore.ts`, `src/renderer/src/features/chat/state/chatCoordinatorStore.ts`, and their tests.

1. Add `chatLoading: boolean` (default false) and stable `setChatLoading(boolean)` to the existing transient sheet store. This is renderer UI state only.
2. In a real chat selection, set loading before workspace/hydration awaits and clear it in the latest request's finally block. Same-chat navigation stays a no-load path. New Chat and unmount invalidate pending selections and clear their own loading feedback.
3. Stabilize callbacks passed to ChatTitleList with useCallback. Read current selection/actions through the existing store getState at invocation where appropriate. Memoize ChatTitleList so opening/closing the parent sheet with unchanged list inputs does not rebuild its entries. Keep its own selected-chat/list/search/edit state subscriptions responsive.
4. Preserve the current 300 ms sheet close animation, grouping, row containment, keyboard accessibility, task board, search, delete/undo, and existing hover behavior. Row virtualization is outside this package.
5. Extend internal `hydrateChat(chatId, options?)` with optional `options.isCurrent: () => boolean` to reject obsolete selection completion before committing any store state. Check after asynchronous reads and before restoring the transcript/model/scroll hint. Existing direct callers retain behavior when the option is absent. ChatSheet supplies its request-token predicate. This prevents an older load from replacing the latest selection while asynchronous work completes.
6. Workspace preparation remains in its existing ownership and order. The optimization targets CPU work and visibility; query batching is a separate measured opportunity.
7. A coordinator-owned transient selection epoch covers external `/clear`, input-toolbar New Chat, workspace shell selection, and foreground `applyReadyChat` that changes the current ID or UUID. Same-identity ready refreshes update metadata and preserve the epoch, allowing a pending user selection to finish. ChatSheet captures the epoch before its first await; hydration checks it again internally. After hydration, verify the selected target identity before writing a search hint. Error/commit guards use request and epoch; finally clears feedback using only latest-request ownership. This keeps cleanup effective after an external reset. The epoch is an in-memory closure value exposed by `getSelectionEpoch()` and has no persistence/IPC representation.

Tests: parent open/close does not commit the memoized title-list body; list/selected ID changes do update it; callback reads latest selected chat; successful/failing selection resets loading; A-to-B rapid selection keeps B authoritative; New Chat during hydration remains new; stale completion cannot clear a newer load; same-chat search still scrolls correctly. Keep existing subscription and hover regression tests.

## 5. Package C: demand-mounted bodies and deferred measurement

Owner: Luna Max C.

Owned implementation: `src/renderer/src/features/chat/shell/ChatTranscriptScroller.tsx`, `src/renderer/src/features/chat/message/user-message/index.tsx`, optional small chat-local helper, and their tests. Avoid editing assistant-message or shared library implementations.

1. Retain every MessageScrollerItem shell, message ID, order, and scroll-anchor metadata. Reuse installed `useMessageScrollerVisibility()` (already re-exported by the shared wrapper); use the primitive's observer/scroll ownership.
2. Initially mount the latest user/assistant, pending messages, explicit search target, and the final two visible transcript items. Mount additional bodies when their shell enters the registry's visibleMessageIds. Once mounted in this conversation, retain each body until the message/conversation is removed. This preserves local disclosure state and avoids repeated Markdown work during scrolling.
3. Use an accessible lightweight placeholder with a conservative size matching the existing 10rem intrinsic item estimate for an unmounted body. Wrapper presence and IDs remain stable. Explicit search targets must mount before the jump and remain mounted after the hint clears. The registry remains responsible for resizing and position adjustment.
4. No background loop that eventually mounts the entire transcript. The initial work is bounded by visible/forced bodies; visited history remains mounted as a deliberate simple retention policy. Document that memory follows visited history and that full recycling would be a later separate feature.
5. A short chat that fits in the viewport must fill naturally when visibility reports arrive. Guard against an empty visibility snapshot, absent IntersectionObserver, rapid conversation changes, and pending-to-committed assistant replacement.
6. Move CollapsibleUserMessageContent's synchronous first layout measurement to the existing ResizeObserver/effect path, with one rAF-batched measurement for fallback/content changes. Preserve collapsed max-height, controls, expanded height, and cleanup. Avoid repeated same-value updates and ensure late callbacks cannot affect a removed message.

Tests: shells remain registered for all messages; expensive bodies are initially bounded; visible/forced bodies mount; visited bodies persist; search target mounts and persists after hint consumption; conversation identity resets the retention cache; absent observer falls back safely; pending assistant identity remains stable; initial user-message layout effect does not read scrollHeight; observer/fallback measurement updates collapse controls; cleanup cancels queued frames.

Risk gate: if the installed scroller cannot preserve end/target alignment while a placeholder expands, report the failing reproduction immediately. Fix within its existing feature integration boundary; keep the shared scroll controller unchanged. Validate actual Electron scroll behavior before declaring this package accepted.

## 6. Integration and review

The root agent reviews the three packages together, synchronizes DESIGN.md and renderer architecture, and uses a separate Luna Max review pass after implementation. Package owners inspect their exports and callers before edits, use apply_patch, avoid unrelated rewrites, run focused checks, and report exact test counts and remaining runtime gaps. Parallel owners communicate contract changes before touching another owner's file.

Acceptance checks cover history-first entry, normal chat switch, New Chat, fresh submit, streaming append, cancellation, search jump, top/history scroll, jump-to-latest, disclosure expansion, window resize, Light/Dark tokens, and reduced motion. Run tokens and current selection remain authoritative under overlapping requests.

## 7. Verification commands

Run from the repository root:

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run src/renderer/src/features/chat/shell/__tests__ src/renderer/src/features/chat/title/__tests__ src/renderer/src/features/chat/state/__tests__ src/renderer/src/features/chat/message/assistant-message/__tests__ src/renderer/src/features/chat/message/user-message/__tests__
pnpm_config_verify_deps_before_run=false pnpm run typecheck:web
pnpm_config_verify_deps_before_run=false pnpm run check:renderer-boundaries
pnpm_config_verify_deps_before_run=false pnpm run check:renderer-doc-paths
pnpm_config_verify_deps_before_run=false pnpm run test:renderer-architecture
pnpm_config_verify_deps_before_run=false pnpm exec vitest run --silent --reporter=dot
pnpm_config_verify_deps_before_run=false pnpm exec electron-vite build
git diff --check
```

Use the actual new test paths in completion records. Run focused coverage for the changed state/visibility paths where supported. Production build evidence and real-window behavior are separate gates.

## 8. Runtime measurement and recovery

Use the same chat and current debug-toggle setting. Record whether DevTools is open and whether the process or only the renderer was restarted. Capture click, load-complete, transcript-body mount, first visible text, settled scroll, and long tasks. Compare like-for-like runs; target at least a 40% reduction in click-to-visible-text versus the recorded development baseline, and zero empty-body frames after the loading feedback disappears. Report actual measurements rather than a promised threshold.

Inspect a long chat and a short chat, opening an older search result and scrolling in both directions. Confirm that placeholders expand without losing the selected target or manual scroll position. Check live provider behavior only through an explicitly authorized normal user submission; keep diagnostics free of chat payloads and credentials.

Rollback is a source-only revert of the affected package. No database or configuration migration is involved. Failure in demand-mount acceptance can be isolated from the independently useful visibility and list-isolation packages; record the scope accurately.

## 9. Completion record

Follow-up presentation work: [ChatWindow content-surface entrance](chat-window-entrance-animation.md) adds one bounded parent-surface opacity animation while retaining this guide's first-paint and demand-mount contracts.

### Implementation

Three parallel `gpt-5.6-luna` agents at `max` reasoning implemented Packages A–C. The root integrated their changes, added memoization and overlapping-loading regression tests, and synchronized DESIGN.md, renderer architecture, and documentation indexes.

- A separates history visibility from fresh Welcome submission, invalidates stale timers on selection/reset/unmount, and latches live playback eligibility per message identity. Historical text/code and the latest historical shell render in their final visible state. Loading feedback retains the current surface.
- B stabilizes list callbacks and memoizes ChatTitleList. Latest-request ownership guards hydration, error reporting, loading completion, New Chat, and unmount.
- C keeps the complete MessageScroller shell registry and mounts bodies on visible/forced demand. Visited bodies remain mounted for the conversation. User-message height reads move to a coalesced effect/ResizeObserver frame with cleanup.

Cross-review identified a fresh-submission-to-history race within the 220 ms Welcome transition. Package A now consumes loading/idle conversation-switch intent to invalidate that transition. Its regression includes a distinct historical UUID, stale pending submission, and loading completion. Initial pending StrictMode mount and timer cleanup are also covered. Root review caught historical rows inheriting a global live animation state and live playback being disabled on run settlement; per-message/latest qualification and the identity latch cover both paths.

The independent Luna Max integration review additionally confirmed two boundary cases, both repaired before handoff: the previous latest assistant becoming live while a new user submission waits for persistence, and external New Chat/workspace entry points bypassing ChatSheet's local request token. Current-turn qualification now checks pending-user ownership and the latest user index; only the latest assistant performs that index lookup. The shared coordinator epoch protects both hydration and earlier workspace/typewriter awaits. Target identity is checked before the search hint is committed. Review also retained precise placeholder-expansion drift as a real-window acceptance gap; the installed scroll controller remains unchanged.

### Automated evidence

The commands in section 7 passed, with these results:

- Full Vitest run: **296 files passed, 3 skipped; 1,833 tests passed, 13 skipped**.
- Renderer TypeScript check, dependency boundaries, active documentation paths, and all 5 architecture checks passed.
- Production bundling with `electron-vite build` passed in an isolated source snapshot. The active development output directory was preserved. Existing mixed static/dynamic import warnings remain.
- `git diff --check` passed. The full suite and all renderer gates were rerun after the final state-race corrections.
- New regressions were run against baseline production sources in an isolated snapshot: selection/authority, memoized title reads, body mounting/measurement, history opacity, and Welcome lifecycle assertions fail on baseline and pass on the implementation.

The full `pnpm build` type-check gate has a separately verified existing failure: `src/main/tools/webTools/__tests__/webToolsUnits.test.ts:352`, TS18048 on `searchDefinition.function.parameters.properties.engine`. This task leaves that Main test unchanged. Coverage instrumentation was not run.

New dedicated regression files:

- `src/renderer/src/features/chat/shell/__tests__/ChatWindow.history-visibility.test.tsx`
- `src/renderer/src/features/chat/shell/__tests__/ChatTranscriptScroller.mounting.test.tsx`
- `src/renderer/src/features/chat/shell/__tests__/ChatTranscriptScroller.primitive.test.tsx`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/AssistantMessageLayout.history-visibility.test.tsx`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/TextSegment.history-visibility.test.tsx`

### Development-window evidence

Computer-use checked the actual Electron development window. The debug toggle remained **enabled**. After all race fixes and verification, the renderer was reloaded and the same 70-stored-message / 8-visible-item baseline chat was selected first; the process and Vite module cache were warm. DevTools was closed during the measured click. A bounded rAF probe recorded DOM presence and counts only.

| Milestone | Previous development sample | Implementation sample |
| --- | ---: | ---: |
| First observed frame after click | 401.7 ms; transcript absent | 126 ms; transcript absent |
| Transcript DOM present | 1,338.5 ms | **350 ms** |
| Initial mounted bodies / shells | 8 / 8 | **2 / 8** |

The transcript-DOM milestone decreased by approximately **74%** in this final-version sample. An earlier implementation sample also recorded 350 ms, with its first frame at 116 ms. These are small-sample development observations. The optimized samples kept 6 placeholders and 2 bodies through their 2-second observation windows. Screenshots confirmed visible historical text and end alignment. The optimized probe did not capture paint/compositor timing or long-task durations, so its 350 ms DOM milestone is distinct from the prior 1.83-second screenshot text milestone.

Manual upward scrolling mounted additional bodies (6 → 4 → 0 placeholders); visited bodies stayed present, and jump-to-latest returned to the tail. A separate message-content search opened an older assistant response in the same chat with 5 remaining placeholders. Its target text was visible, upward browsing mounted more history, and jump-to-latest returned to the tail. Automated tests cover explicit search targets, missing IntersectionObserver, pending assistant identity, and rapid conversation switching.

Remaining real-environment acceptance: repeated process-cold and production-window timing; precise pixel drift during placeholder expansion across search/manual-scroll modes; live provider streaming/cancellation; resize, Light/Dark, and reduced-motion combinations. The 40% visible-text target and zero-empty-frame condition require a comparable paint-level capture before being marked accepted. External reset immediately invalidates an old selection; its loading feedback clears when that request settles. Temporary probes remain outside repository source and are cleared by renderer reload. This records the 2026-09-02 implementation handoff; subsequent checkpoint verification is recorded below.

### 2026-09-03 checkpoint correction

Pre-commit review reproduced a same-shell `CHAT_READY` race: while A was submitting and B was loading, A's ready metadata refresh incremented the selection epoch and cancelled B. `applyReadyChat` now advances the epoch when the selected ID or UUID changes. Explicit `selectChatShell`, reset, external ready selection, and background `selectShell: false` retain their existing authority.

The colocated coordinator regression covers ready delivery before hydration, during chat lookup, and during message lookup. All three cases failed on the previous implementation with `chat-a` still selected, then passed after the guard change with B's transcript, model sync, and scroll hint committed. External-ready coverage checks ID-only, UUID-only, and combined identity changes. Real provider event timing remains part of the runtime acceptance matrix above.
