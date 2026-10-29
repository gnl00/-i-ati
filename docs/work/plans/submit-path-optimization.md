# Submit-path optimization

Status: In progress
Owner: Agent runtime maintainers

## Scope and evidence

Follow user submission through Main admission, Chat preparation, context projection,
model dispatch and tool continuation. Baseline: e485397a. Preserve unrelated CLI
implementation/thinking guide edits. Each numbered stage receives its own commit
with targeted verification; final verification includes coverage and isolated Electron.

Observed issues: desktop sends chatUserInstruction while preparation reads
userInstruction; Main re-adds web_search independently of the desktop toggle;
main-tool execution does not bind allowedTools to the request. Preparation lacks
the run signal. MCP failures resolve as successful values and calls omit cancellation.
Admission only rejects duplicate submission IDs. Awake loads all memories, performs
multiple embedding searches, and its requested similarity threshold is ignored.
Independent preparation tasks wait serially. Every submit loads and broadcasts all
history before applying compression summaries.

## Implementation stages and acceptance

1. **Submission intent**: define persisted Chat instruction vs per-run additions;
   resolve both in Main. Send tool selection intent from desktop, resolve schemas
   in Main, and use the resolved tool names for execution admission. Web Search off
   must affect both request and execution. Preserve CLI/Telegram defaults and approvals.
2. **Cancellation and tool outcomes**: propagate one run signal through preparation
   and MCP; prevent new work/writes after cancellation. Preserve submitted user input.
   Classify missing routes, transport errors, MCP isError and cancellation accurately.
3. **Conversation admission**: normalize existing chat identity in Main and reject a
   concurrent primary run with an explicit busy error. Preserve duplicate-ID behavior,
   independent chats, steering, cancellation, and reservation cleanup after failure.
4. **Retrieval work**: honor similarity thresholds in the owning search layer; query
   bounded pinned preferences; reduce redundant embeddings with evidence and bounded
   reuse. Bound optional retrieval waiting and distinguish timeout from cancellation.
5. **Preparation scheduling and measurement**: measure submit/preparation phases,
   overlap independent vision/context work, preserve input/observation persistence order,
   freeze per-run configuration, and test cancellation/failure races. Record measured
   work/latency for deterministic fixtures; make no external-provider speed claims.
6. **History ownership**: separate renderer hydration from model context reads. Query
   compatible summary plus uncovered history and current input, preserving complete
   tool pairs, branch snapshots, failures and full historical recovery. Avoid fixed-N
   truncation. Validate long-history read/IPC work and renderer hydration semantics.

## Verification gates

For each stage: related Vitest tests, changed-file ESLint, affected Node/web typechecks,
and git diff --check. Contract/import changes require process architecture checks;
active source path changes require doc-path checks. Record pre-existing blockers
separately. Final: pnpm test:coverage, pnpm build and isolated Electron acceptance with
local deterministic providers. No push, release or packaging is included in this scope.

## Progress

Plan recorded; implementation pending.

### Stage 1 — submission intent

Implemented Chat instruction fallback/explicit-empty/additive semantics and desktop
name-only tool intent. Main resolves MCP schemas and the web-search toggle; the
prepared request names constrain execution before approval. Existing host defaults
are retained. New shared contract has no database migration.

Verification: 135 targeted cases across ChatPreparationPipeline, ToolListBuilder,
ToolExecutor, Chat IPC, DefaultMainAgentRuntimeRunner integration, useChatRun and
collectRunToolSelection passed (including focused reruns after fixture fixes).
`pnpm run typecheck`, both boundary checks and architecture test commands, both
active documentation path checks and `git diff --check` passed. Changed-file ESLint
was run and compared to HEAD: existing lint errors remain in legacy files; newly
added files/tests have zero errors. Formatting warnings follow the existing style.
Electron acceptance and full coverage are scheduled after all stages.

### Stage 2 — cancellation and MCP outcomes

One signal now reaches preparation, vision, dispatcher and MCP SDK calls. Aborted
preparation preserves submitted user messages and suppresses late observation/context
writes and model dispatch. Transport/unavailable-route failures reject; MCP isError
retains content with an error status. Cancellation after approval prevents dispatch.
Non-cancellable local reads can finish after the wait exits; remote cancellation does
not establish rollback. Vision timeout remains distinct from user cancellation.

Verification: `pnpm exec vitest run src/main/hosts/chat/__tests__
src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts
src/main/hosts/chat/vision/__tests__ src/main/services/mcpRuntime/__tests__
src/main/agent/tools/__tests__/ToolExecutor.test.ts
src/main/orchestration/chat/run/runtime/__tests__/AgentRun.test.ts
src/main/agent/runtime/tools/__tests__ src/main/agent/runtime/__tests__/AgentRuntime.test.ts
` — 12 files, 177 tests passed. The original command also included a non-existent
subagent runtime test-directory filter; it selected no tests and was removed here.
`pnpm run typecheck:node`, `pnpm run check:main-boundaries`,
`pnpm run test:main-architecture` and `git diff --check` passed. Scoped ESLint retains
baseline errors only; new abort-wait utility has zero errors. Final Electron/coverage
verification remains pending.

### Stage 3 — conversation admission

Main now resolves existing chat aliases and rejects a concurrent primary run before
acceptance. The registry retains ownership through cancellation cleanup and releases
it on normal/failure paths. Newly created identity is bound before CHAT_READY, closing
the preparation window. Missing or inconsistent existing identity fails explicitly.

Verification: `pnpm exec vitest run
src/main/orchestration/chat/run/runtime/__tests__/AgentRun.test.ts
src/main/orchestration/chat/run/runtime/__tests__/RunManager.test.ts
src/main/orchestration/chat/run/runtime/__tests__/RunRegistry.test.ts
src/main/hosts/chat/__tests__/ChatSessionStore.test.ts
src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts` — 86 tests
passed. Node typecheck, Main boundary/architecture checks and diff check passed.
Scoped ESLint compared with baseline retains existing errors only. Independent chat,
alias collision, Stop cleanup, acceptance failure and subsequent admission covered.

### Stage 4 — bounded retrieval

Memory search now honors similarity thresholds, including an explicit zero at the
tool boundary. Pinned preferences use an additive partial index and LIMIT 3; initial
index creation scans existing metadata once. Empty/weak queries without task context
skip semantic search. Independent retrieval failures preserve successful sources.
Automatic retrieval has a 2-second wait budget and observes run cancellation; native
embedding work already started can finish but cannot launch a cancelled downstream
query. Embedding promises use a 32-entry LRU, exclude texts over 4096 characters,
clone returned vectors, evict failures and clear on disposal.

Verification: targeted Vitest suites cover Awake, embedding, real SQLite memory SQL,
retrieval deadlines, activity journal, knowledgebase, preparation providers and memory
tools (142 cases). Node/web typechecks, Main boundaries/architecture tests and active
doc-path checks passed. Scoped ESLint matches existing baseline errors; new retrieval
and SQL tests have zero errors. SQL fixtures verify the pinned index and threshold
boundary; cache tests verify concurrent reuse, eviction, option keys and mutation
isolation. Full coverage and Electron remain final integration gates.
