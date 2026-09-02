# Chat Sheet performance optimization implementation guide

Status: Implemented; automated verification complete, streaming profile pending
Owner: Renderer maintainers
Date: 2026-09-02
Scope: `src/renderer/src/features/chat/shell/ChatSheet.tsx` and `src/renderer/src/features/chat/title/ChatTitleList.tsx`

## 1. Goal

Keep the chat surface responsive during long tool-heavy conversations and make opening, hovering, and scrolling the chat sheet remain smooth with the current 575-chat dataset.

The measured conversation has 8 visible turns, 70 persisted messages, 62 tool results, about 646 KB of message JSON, and 320 persisted run events. The current application database contains 575 chats. Opening the sheet exposes about 3,450 accessibility nodes, while the chat surface exposes about 414.

## 2. Root cause

Three costs currently overlap:

1. `ChatSheet` calls `useChatStore()` without selectors. Every transcript patch, tool status update, scroll hint, and chat-run update schedules a `ChatSheet` render.
2. `ChatTitleList` stores the hovered row in component state. Moving the pointer between rows renders the whole title list again, including all grouped chat rows.
3. Every title row participates in initial layout and paint. The list has no screen-level rendering containment.

The current development instance also has `tools.streamChunkDebugEnabled` enabled. It produced 12,235 `stream.chunk` entries during the latest conversation and 24,009 entries during the day. That flag is an explicit protocol-diagnostics mode and remains outside this code change.

## 3. Chosen approach

Apply the smallest change at the renderer ownership boundaries:

- Subscribe `ChatSheet` to each required store field or action through individual Zustand selectors.
- Replace hover state in `ChatTitleList` with `group-hover` CSS selectors.
- Add `content-visibility: auto` and a conservative intrinsic row size to chat rows so Chromium can skip off-screen layout and paint.
- Preserve the current grouping, search, edit, delete, schedule board, sheet animation, and chat-switch behavior.
- Add regression tests that observe render commits and interaction behavior.

This approach uses current React, Zustand, Tailwind CSS v4, and Chromium capabilities. It adds no dependency, schema, IPC contract, configuration field, or persistent state.

## 4. Scope

### Files to change

1. `src/renderer/src/features/chat/shell/ChatSheet.tsx`
   - Replace broad store access with precise selectors.
   - Keep imperative reads through `useChatStore.getState()` where fresh state is required inside callbacks.
2. `src/renderer/src/features/chat/title/ChatTitleList.tsx`
   - Remove hover state and pointer handlers used only for visuals.
   - Express hover visuals with `group-hover` utilities.
   - Add screen-level rendering containment without changing row height or scroll semantics.
3. Colocated tests under `src/renderer/src/features/chat/shell/__tests__/` and `src/renderer/src/features/chat/title/__tests__/`.
4. This guide and `docs/README.md`.

### Explicitly excluded

- Transcript virtualizer, scroll anchoring, and `ChatTranscriptScroller` behavior.
- Database cleanup, event retention, FTS rebuilding, or message compaction changes.
- Scheduler ownership changes.
- Sheet visual redesign, animation duration changes, blur changes, or theme token changes.
- Changes to the semantics or default value of `streamChunkDebugEnabled`.
- A new list virtualization package.

## 5. Implementation details

### 5.1 Isolate `ChatSheet` from transcript updates

Select only these values from `useChatStore`:

- `upsertMessage`
- `patchMessageUiState`
- `toggleWebSearch`
- `setScrollHint`
- `currentChatId`
- `currentChatUuid`
- `replaceChatList`
- `hydrateChat`
- `resetChatContext`

Use one selector call per field. Actions are stable and this avoids adding an equality helper.

Keep `useChatStore.getState()` for callback-time access to `messages` and `chatList`. This preserves fresh reads without adding subscriptions.

Apply the same selector discipline to `useSheetStore` and `useAppConfigStore` when their exported hooks accept selectors. Preserve current behavior when either wrapper exposes a different API.

### 5.2 Remove hover-driven list renders

Delete both hover state variables and `onMouseOver` / `onMouseLeave` handlers.

Translate the existing states directly:

- title: `group-hover:text-gray-900` and the matching dark token;
- count pill: `group-hover:pointer-events-none group-hover:translate-x-2 group-hover:scale-75 group-hover:opacity-0`;
- action group: default hidden transform plus `group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100`.

Keep the edit-confirm branch and active-row styling unchanged. Search-mode rows and grouped rows must use the same CSS-only hover contract.

### 5.3 Cull off-screen title-row rendering

Add Tailwind v4 arbitrary properties equivalent to:

```css
content-visibility: auto;
contain-intrinsic-size: auto 44px;
```

Apply them to stable row wrappers. Search rows with snippets may use a larger intrinsic size matching their current visual height. Sticky date headers remain outside contained rows.

Avoid `contain: strict`, fixed heights, absolute positioning, manual scroll math, and JavaScript observers.

### 5.4 Preserve diagnostic logging semantics

Leave `src/main/request/adapters/base.ts` unchanged. Runtime performance acceptance uses `streamChunkDebugEnabled=false`. A second short run with the flag enabled confirms that protocol diagnostics still work and records its expected overhead separately.

## 6. Regression tests

### Store subscription test

Render `ChatSheet` with `ChatTitleList` mocked by a render-count probe. Change an unrelated transcript field such as a message preview patch. The probe render count must remain unchanged. Change `currentChatId` or open the sheet and confirm the relevant render occurs.

### Hover interaction test

Render `ChatTitleList` with multiple chats under a React `Profiler`. Move the pointer across rows. The hover transition must not cause a React update commit. Confirm edit, delete, and chat selection callbacks still fire.

### Static behavior assertions

Confirm both search and grouped title rows carry the CSS-only hover classes and rendering-containment properties. Confirm date headers retain sticky positioning.

## 7. Verification commands

Run from the repository root:

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run src/renderer/src/features/chat/shell/__tests__/ChatSheet.performance.test.tsx src/renderer/src/features/chat/title/__tests__/ChatTitleList.performance.test.tsx
pnpm_config_verify_deps_before_run=false pnpm run typecheck:web
pnpm_config_verify_deps_before_run=false pnpm run check:renderer-boundaries
pnpm_config_verify_deps_before_run=false pnpm run check:renderer-doc-paths
pnpm_config_verify_deps_before_run=false pnpm run test:renderer-architecture
git diff --check
```

The implementer may use different colocated test filenames and must update this command to the exact files created. Avoid formatting or lint commands that rewrite unrelated files.

## 8. Runtime acceptance

Use the current development database and current Electron instance after a fresh `pnpm dev` start.

1. Set `streamChunkDebugEnabled=false` through the existing Settings control.
2. Open the latest 8-turn tool-heavy chat.
3. Record a React Profiler trace while one response streams.
   - `ChatSheet` has zero commits caused solely by transcript preview patches while the sheet is closed.
   - `ChatTitleList` has zero commits caused solely by transcript preview patches while the sheet is open.
4. Open the chat sheet and move the pointer across at least 20 rows.
   - React Profiler shows zero update commits from hover changes.
   - Edit/delete controls appear visually and remain clickable.
5. Scroll from the newest chats to older date groups and back.
   - Sticky headers, search, selected-row styling, and scroll position remain correct.
   - DevTools Performance shows no interaction task over 100 ms during the checked open, hover, and scroll actions.
6. Enable `streamChunkDebugEnabled` for one short response and confirm `stream.chunk` entries still appear in the application log. Restore the user's original setting after the check.

## 9. Failure handling and rollback

The change is renderer-only and carries no data migration. Rollback consists of reverting the component and test changes.

If `content-visibility` causes scroll-position drift or incorrect intrinsic sizing, retain the selector and CSS-hover fixes and remove only the containment utilities. Those two fixes are independently useful and preserve all layout behavior.

## 10. Completion criteria

Implementation is complete when:

- broad store subscription is absent from `ChatSheet`;
- hover visuals create no React state updates;
- off-screen title rows use rendering containment;
- focused tests and renderer architecture gates pass;
- runtime acceptance is recorded with the 575-chat dataset;
- unrelated worktree changes remain untouched.

## 11. Implementation verification

Implemented on 2026-09-02 with precise Zustand selectors, CSS-only row hover, and Chromium rendering containment. The focused suite passes 5 tests across the Chat Sheet subscription and Chat Title List interaction coverage. Renderer typecheck, dependency boundaries, documentation paths, architecture tests, and `git diff --check` pass.

A live Electron smoke check against the same 575-chat database measured about 2,189 accessibility-tree lines with the sheet open, compared with about 3,450 before the change, a 36.6% reduction. The sheet retained the task board, current groups, older date groups, search entry, and historical chat access. A React Profiler trace during a fresh model stream remains the final runtime acceptance item.
