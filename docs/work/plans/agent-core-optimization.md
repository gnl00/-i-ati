# Agent core optimization

Status: In progress

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

- Plan recorded; implementation pending.

### Stage 1 — complete

Empty-response attempts consume maxSteps, emit failed steps and contribute known
usage. Failed/cancelled streams preserve received usage. Chat drops incomplete
previews. Checks: `pnpm exec vitest run src/main/agent/runtime/__tests__/AgentRuntime.test.ts src/main/hosts/shared/render/__tests__` (35 passed),
`pnpm run typecheck:node`, and `git diff --check` passed. Scoped ESLint reports
13 baseline errors (8 explicit-return-type, 5 any); comparison against HEAD found
the same rule counts. Existing repository Prettier configuration also reports
format warnings; no broad formatting rewrite was performed. Electron acceptance
and full shared-runtime coverage remain scheduled for final verification.
