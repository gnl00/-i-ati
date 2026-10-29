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
