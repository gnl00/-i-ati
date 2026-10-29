# Agent core optimization

Status: Complete

Scope: optimize the shared runtime without changing provider protocols, persisted formats,
approval behavior, or host ownership. Existing unrelated working-tree changes are excluded.

## Evidence and sequence

1. **Attempt lifecycle and usage**: empty-response recovery currently skips step termination
   and usage aggregation. Count every model step against maxSteps, retain one recovery only
   when budget remains, and emit a failed step for incomplete responses. Preserve raw context.
2. **Streaming accumulation**: remove full delta history and retain only tool timing facts;
   preserve emitted snapshots and earliest tool start/ready fallback semantics.
3. **Context measurement**: bound tokenizer cache by input size, avoid duplicate serialization,
   and reduce repeated full-request measurements during context trimming. Keep final budget checks.
4. **Event delivery**: inspect and measure the actual host pipeline before changing scheduling.
   Keep required persistence ordered, isolate optional observers, and optimize only demonstrated work.
5. **Tool mapping**: replace the single field-mapping materializer service with a plain function;
   retain ToolBatchAssembler's real confirmation-policy consumers.
6. **Skill refresh ownership**: move load/unload name matching into the existing skill provider;
   the loop only appends returned context records.

Each stage receives a separate Conventional Commit after scoped verification. This document
is updated in each stage with results and any evidence-based adjustment.

## Verification

Run affected Vitest suites, changed-file ESLint, and Node typecheck per stage.
Run main boundary/architecture checks when imports or contracts change and documentation path
checks when active paths change. Run full coverage before delivery for shared runtime changes.
Check host lifecycle regressions with existing integration tests; record any Electron acceptance
gap explicitly. Performance claims require measurements; algorithmic bounds alone are not timings.

## Progress

- Plan and all six implementation stages are committed; final verification is recorded below.

### Stage 1 — complete

Empty-response attempts consume maxSteps, emit failed steps and contribute known
usage. Failed/cancelled streams preserve received usage. Chat drops incomplete
previews. Checks: `pnpm exec vitest run src/main/agent/runtime/__tests__/AgentRuntime.test.ts src/main/hosts/shared/render/__tests__` (35 passed),
`pnpm run typecheck:node`, and `git diff --check` passed. Scoped ESLint reports
13 baseline errors (8 explicit-return-type, 5 any); comparison against HEAD found
the same rule counts. Existing repository Prettier configuration also reports
format warnings; no broad formatting rewrite was performed. Electron acceptance
and full shared-runtime coverage remain scheduled for final verification.

### Stage 2 — complete

Removed draft delta history; two tool timing indexes preserve earliest timestamps
by ID/index with started-before-ready preference. Stream events keep independent
snapshots. Checks: runtime/model suites (33 tests, including 4096 streamed content
and reasoning chunks), Node typecheck, main boundaries, main architecture (8 tests),
and active doc paths passed. Scoped lint comparison retains baseline errors only.
The removed growing-array copy had quadratic element-copy work; no wall-clock
speedup is claimed from the functional tests.

### Stage 3 — complete

Tokenizer caches only strings up to 8192 characters (128 entries, at most about
2 MiB of UTF-16 keys); provider measurement serializes once. Historical trimming
uses binary prefix probes while preserving complete groups and final budget checks.
BPE counts need not be strictly monotonic: this is a bounded valid selection, not
a promise of mathematically maximal retention. A 256-group regression fixture
requires at most 15 provider measurements and preserves required/current context.
Context suites (34 tests), Node typecheck, main boundary/architecture/doc-path checks
passed; scoped ESLint comparison has no new errors. Updated the stale documented
unknown-window default to the existing 262144 implementation.

### Stage 4 — complete

Inspection found optional transport errors already isolated, but awaited preview
delivery still blocked each stream delta. Kept the raw bus and required consumers
ordered; coalesced optional host previews with stable-output barriers. A controlled
slow-sink test submits 100 previews without releasing the sink, delivers all 100 to
the required consumer and only first/latest to the slow transport, then drains
before terminal output. This measures delivered work, not end-to-end latency.
Shared output/render and Telegram runtime suites: 77 passed. Node typecheck and
scoped ESLint error checks passed (format warnings remain). Barrier ordering and
preview failures are covered. Actual external transport latency is not benchmarked.

### Stage 5 — complete

Replaced ReadyToolCallMaterializer's class/interface/input contract and factory
injection with `toReadyToolCall()` beside its output type. Removed unused stepId
input and obsolete documentation paths. ToolBatchAssembler and approval policies
remain intact. Runtime/tool suites, Node typecheck, main boundaries, main architecture
and active doc paths passed; scoped lint retains only pre-existing return-type
errors in AgentLoop. This is a maintenance reduction, not a latency claim.

### Stage 6 — complete

Moved skill tool-name/status matching into the Chat skill provider; loop passes
results and appends the returned record. Provider reads skill state only once per
successful skill-changing batch. Preserved the source metadata previously lost by
the runtime adapter, so hidden context retains its ownership semantics. Null-context
fallback remains unchanged. Runtime, provider and main-run integration suites:
35 passed. Node typecheck, main boundary/architecture/doc paths passed. Scoped lint
has no new errors, including the new provider tests. Full coverage/build and
isolated Electron acceptance are running as final cross-stage verification.


## Final verification

- `pnpm test:coverage`: 384 files passed, 7 skipped; 3058 tests passed, 37 skipped.
  Overall statements 72.83%, branches 65.62%, functions 67.19%, lines 73.83%.
- `pnpm build`: both Node/web TypeScript checks and production bundles passed.
- `pnpm run check:main-boundaries`, `pnpm run test:main-architecture` (8 tests),
  `pnpm run check:main-doc-paths`: passed during the contract/import stages.
- `node scripts/verify-cli.mjs`: passed using isolated temporary profile/workspace
  and a deterministic local provider, in real Electron processes. Covers long
  streaming output, tools, approval auto/deny, reasoning replay, configured vision,
  step exhaustion, timeout/SIGINT/SIGTERM, and redaction. Added empty-response recovery:
  two attempts total 45 tokens; maxSteps=1 makes one request totaling 15 tokens;
  discarded reasoning is absent from both transcript and persisted messages.
- `node --check scripts/verify-cli.mjs`, scoped ESLint on the acceptance script,
  and `git diff --check`: passed. Source lint retains verified pre-existing
  return-type/any errors and repository-wide Prettier-style warnings; no new lint
  errors were introduced. Full-repository lint cleanup was outside this task.

The initial sandboxed CLI acceptance could not bind 127.0.0.1 (EPERM); the approved
local execution completed successfully. Desktop GUI Light/Dark/screenshots, Windows,
Linux, signed packages and real external-provider/Telegram latency were not tested.
No provider-speedup percentage is claimed. All commits are local and unpushed.
The two pre-existing CLI guide edits remain outside the commits.

## Stage commits

| Stage | Commit |
| --- | --- |
| Plan | d6eed1b5 |
| Attempt lifecycle and usage | 58bf2bb4 |
| Streaming timing indexes | b5b73aa3 |
| Context cache and trimming | f21e510f |
| Optional preview delivery | aa5b644a |
| Tool mapping | 79ffccf0 |
| Skill refresh ownership | 2fe2a736 |
