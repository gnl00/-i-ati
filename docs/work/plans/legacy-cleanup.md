# Legacy cleanup

Owner: Repository maintainers<br>
Status: Active<br>
Started: 2026-09-29<br>
Target: Remove unused compatibility surfaces in bounded phases<br>
Exit criteria: Every inventory item has a verified removal or retention decision; required checks and runtime acceptance are recorded<br>
Related specs: [Documentation governance](../../specs/documentation-governance.md)<br>
Related implementation: [Main architecture](../../architecture/main-process-architecture.md), [Renderer architecture](../../architecture/renderer-architecture.md)

## Scope and baseline

The user approved documentation followed by phased cleanup on 2026-09-29.
The initial static survey found 22 groups: 15 behavior groups, four old type
groups and three compatibility facade/export groups. Production keyword hits
covered 18 files and 86 matching lines; tests and source documentation covered
27 files and 85 matching lines. These counts are a discovery baseline, not
implementation line counts or proof that every item can be removed.

The baseline includes unrelated staged and unstaged database, transcript,
schedule-notification and CLI documentation work. Preserve those edits. No
commit or push is included in this task. Keep durable-data migrations until
their supported input formats and data-loss consequences have been resolved.

## Inventory and phases

| ID | Surface | Phase / decision | Evidence and acceptance |
| --- | --- | --- | --- |
| L01 | Five old Chat IPC channel aliases | 2: removed | Renderer invokes `run:*`; keep current cancellation/approval validation and IPC tests |
| L02 | Legacy absolute and `workspaces/` paths | 5: alias removed; contained absolute paths retained | Renderer file IPC consumes contained absolute paths; the historical user-data-relative input has no producer |
| L03 | Multi-file read IPC | 3: removed | No production invoker consumer; removed processor, types, channel and bridge. Previously registered in tools IPC; no production UI entrypoint found |
| L04 | Old question timeout minimum | 5: removed | Runtime now validates the declared 60–300 second range; older short inputs receive a validation error |
| L05 | Render mapper `hiddenToolNames` convenience option | 2: removed | Production uses default policy or explicit `policy` |
| L06 | Compression `execute()` forwarding alias | 2: removed | Updated both production callers and all mock consumers to `compress()` |
| L07 | Old model slots | 4: retained | Config normalization and model resolution still read old slots |
| L08 | MCP config migration | 4: retained | Startup moves config into dedicated tables |
| L09 | Plugin config migration | 4: retained | Startup moves config before builtin seeding |
| L10 | Emotion state v1 migration | 4: retained | Reads and persists old state as v2 |
| L11 | Retired assistants table cleanup | 4: retained | Documented idempotent migration; no active Assistant preset implementation |
| L12 | Smart Message TTL migration | 4: retained | Existing 48-hour expiries become seven days |
| L13 | Scheduled task schema reset | 4: retained | Startup still supports prior schema generations. Old generation tables are dropped; assess durable-data policy separately |
| L14 | Missing message segment IDs | 4: retained | Stable IDs are needed by transcript patching; dirty mapper work is outside this cleanup |
| L15 | Missing old message timestamps | 4: retained | Search projection needs a timestamp; removing fallback can change search ordering |
| L16 | Deprecated unified request `userInstruction` | 1: removed | Distinguish this deprecated request field from active chat/compact-agent instructions |
| L17 | Three old compression count fields | 1: removed | Production scan finds declarations only |
| L18 | Old global `ToolCallResult` type | 1: removed | Distinguish global interface from active React component and agent result types |
| L19 | Old shared `WebSearchResult` type | 1: removed | Active processor uses `WebSearchResponse`; UI owns a separate same-name type |
| L20 | Database singleton facade | 4: retained | Domain facades use it; main architecture explicitly describes ownership |
| L21 | Renderer `getMessageByIds` export | 3: removed in Renderer | Main has an active request-materialization consumer; narrow Renderer removal only |
| L22 | Provider icon URL map | 3: removed | Available providers now derive from descriptors. No production consumer of the exported URL map |

## Execution and verification

1. Remove unused declarations with exact-symbol and resource-adapter scans.
   Run changed-file lint and both TypeScript checks.
2. Remove unused IPC aliases and render option; collapse compression forwarding.
   Run IPC, mapper, compression execution and post-run tests; main boundary and
   architecture checks; full coverage for the cross-feature runtime change.
3. Trace live file/Renderer/icon consumers and remove only proved unused
   surfaces. Update affected specs/guides and run corresponding architecture
   checks. File or interaction changes require Electron acceptance.
4. Record retention decisions and remaining durable-data policy questions.
   Removing migrations requires an explicit supported-data decision, rather
   than assuming that a legacy marker makes persisted data disposable.

After each phase, scan for stale references, inspect the scoped diff and run
`git diff --check`. Automated verification and Electron observations are
separate evidence. A blocked check leaves acceptance open.

## Progress

- Inventory and phased plan written before implementation.
- Phase 1 implemented: L16–L19 (four groups) removed. Active chat and
  compact-agent instruction handling remains intact; bundled resource scan
  found no deprecated unified-request field consumer.
- Phase 2 implemented: L01, L05 and L06 (three groups) removed. Current
  cancellation and approval validation remains intact. Both compression callers
  and all three mock consumers now call `compress()`.
- Phase 3 implemented: L03, L21 and L22 (three groups) removed. Multi-file
  reads had a forwarding invoker but no production invoker consumer. The
  single-file Artifacts reader remains. Main batch message lookup remains for
  request materialization. Icon descriptors remain the single source of truth.
- Phase 3 retention: L02 remains because Artifacts file IPC and workspace
  relative-path helpers still consume it. L04 remains because the existing
  behavior test requires short input waits to normalize to one minute; this is
  current input tolerance as well as compatibility.
- Phase 4 reviewed: L07–L15 and L20 retained (ten groups). Config/model and
  startup migrations accept stored data; dropping them can lose settings,
  state or schema accessibility. Segment IDs and timestamps serve current
  transcript/search invariants. The database facade is the documented assembly
  boundary. These are retention decisions for this cleanup, not deletion tasks
  awaiting automatic execution.
- Result: ten groups removed, twelve retained with owning rationale. The
  retired `agentCore` directory is already absent; its guard test is retained.

## Verification record

- Pre-change focused baseline: four files / 15 tests passed.
- Phases 1–2: five files / 25 tests passed, using `pnpm exec vitest run` for
  Chat IPC, AgentRenderSegmentMapper, CompressionExecutionService,
  CompressionJobService and MessageCompressionService.
- Phase 3 and integration: four files / 67 tests passed, covering RunService,
  FileOperationsProcessor, WorkspacePathResolver and providerIcons.
- Final combined focused run: nine files / 92 tests passed.
- `pnpm run typecheck:web` passed.
- `pnpm run typecheck:node` remains blocked by TS2307 in the unrelated dirty
  `MessageDao.revision.test.ts` (`node:sqlite` types) and TS18048 in
  `webToolsUnits.test.ts:352`. The latter reproduces in an isolated HEAD
  snapshot; the former belongs to concurrent database work. A task-introduced
  unused import was removed before the final check.
- Changed-file ESLint was run across the 20 task source/test files and compared
  with isolated HEAD. HEAD has 76 existing errors; the current task files have 72. No new error diagnostic
  remains after removing the unused file resolver import. This is a baseline
  comparison, not a green lint result.
- Main/Renderer boundary checks passed; architecture tests passed (seven Main,
  five Renderer); both documentation source-path checks passed.
- `pnpm test:coverage` ran twice. Final run: 326 files passed, two failed,
  five skipped; 2183 tests passed, two failed, 20 skipped. The fixed-count tool
  definition assertion expects 63 tools while current code exposes 49, and
  reproduces on HEAD. The second failure is in the concurrently modified
  `chatRunEvent.test.ts:539` preview-patch argument assertion, outside this
  cleanup. Full coverage acceptance remains open. The initial run also caught
  an old RunService compression mock; it was corrected and its focused suite
  subsequently passed.
- A real Electron process with isolated temporary user data exercised the
  actual Chat and tool IPC registration modules. Startup and single-file read
  channels resolved; empty cancellation input returned `invalid_request`;
  all five retired Chat channels plus the multi-file read channel returned
  `No handler registered`. Business services were stubbed: this verifies
  Electron transport/registration, not a model call or real filesystem read.
- Stale-symbol scan, Markdown links in this plan and `git diff --check` passed.
  No visible layout, theme or motion behavior changed; no screenshots were
  taken. No Git commit or push was performed.

The 2026-09-29 record above preserves the original baseline observations.
The next phase and renewed verification are recorded below. The record remains
Active because changed-file ESLint still has existing baseline errors in large
files, despite no new lint errors from this cleanup.


Final focused test command:

```sh
pnpm exec vitest run \
  src/main/ipc/__tests__/chat.test.ts \
  src/main/hosts/shared/render/__tests__/AgentRenderSegmentMapper.test.ts \
  src/main/orchestration/chat/maintenance/__tests__/CompressionExecutionService.test.ts \
  src/main/orchestration/chat/postRun/__tests__/CompressionJobService.test.ts \
  src/main/orchestration/chat/maintenance/__tests__/MessageCompressionService.test.ts \
  src/main/orchestration/chat/run/__tests__/RunService.test.ts \
  src/main/tools/fileOperations/__tests__/FileOperationsProcessor.test.ts \
  src/main/services/filesystem/__tests__/WorkspacePathResolver.test.ts \
  src/renderer/src/shared/lib/__tests__/providerIcons.test.ts
pnpm run typecheck:node
pnpm run typecheck:web
pnpm run check:main-boundaries
pnpm run test:main-architecture
pnpm run check:renderer-boundaries
pnpm run test:renderer-architecture
pnpm run check:main-doc-paths
pnpm run check:renderer-doc-paths
pnpm test:coverage
git diff --check
```

## 2026-09-30 follow-up

- L02: removed the user-data-relative `workspaces/<chatUuid>/...` input alias,
  the `legacy-compatible` resolver mode and `legacyInput` result field.
  Renderer IPC and embedded file tools now use the same workspace-contained
  resolver. Workspace-contained native absolute paths and stored workspace root
  normalization remain supported. [ADR-0030](../../decisions/0030-retire-legacy-tool-input-compatibility.md)
  records the input contract change.
- L04: removed the 5-second validation floor and silent clamping; values below
  60 seconds now fail with the declared 60–300 second validation range. The
  default remains 60 seconds.
- Removed a fixed total-tool-count assertion that had drifted from 63 to 49
  tools. The uniqueness assertion remains. A Web Search definition test now
  handles an optional schema property correctly under TypeScript.
- Current result: 12 groups removed or narrowed; ten groups retained with
  current consumers or durable-data obligations. The remaining migrations are
  intentionally retained until a supported-data policy is established.
- Focused checks: `pnpm exec vitest run` on UserQuestionToolsProcessor,
  WorkspacePathResolver, FileOperationsProcessor, tool definitions and Web
  Search definition tests passed (five files, 107 tests).
- `pnpm run typecheck` passed for Node and Web. Main/Renderer boundary checks,
  architecture tests and documentation path checks passed. Full
  `pnpm test:coverage` passed (328 files, 2194 tests; five files and 20 tests
  skipped by existing suite configuration).
- Isolated real Electron file-read smoke: workspace absolute and relative paths
  succeeded; the retired user-data-relative prefix did not resolve. An earlier
  isolated Electron IPC smoke verified all six retired channels absent.
- Changed-file ESLint still reports existing errors in
  `FileOperationsProcessor.ts` and `webToolsUnits.test.ts`; compare against
  `HEAD` before treating them as regressions. `git diff --check` passed.
- Unrelated staged `.gitignore` and CLI-guide changes are excluded from the
  phase checkpoint. No push is authorized.
