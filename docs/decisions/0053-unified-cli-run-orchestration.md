# 0053: Unified CLI run orchestration

Status: Accepted
Date: 2026-10-29

## Context

Batch CLI assembled AgentRuntime independently from Chat, Telegram, Scheduler and
TUI. It reused request preparation and tools, but separately owned cancellation,
approval adapters and subagent parent wiring. RunService returned only a reduced
Chat result and rejected unsuccessful completion, losing runtime evidence needed
for CLI transcript artifacts and exit-code mapping.

## Decision

Route batch CLI through RunService.submit, RunManager, AgentRun, shared Chat
preparation, and DefaultMainAgentRuntimeRunner. Keep CliRuntimeRunner as a small
submission adapter. Do not introduce another runtime, database schema, launcher
or CLI flag.

Add Main-local submission options for explicit model/request preparation, step
budget, external AbortSignal, raw event sinks, preparation notification, immediate
confirmation requester, and post-run job policy. IPC continues to accept its
existing validated payload and never accepts these privileged options.

Add a Main-local outcome Promise containing host RunResult and optional complete
AgentLoopResult. Existing completion preserves success/rejection semantics for
all current callers. Capture the raw result before Chat finalization, so a
persistence failure cannot turn an executed task into success or discard its
available transcript and usage. A failure before runtime terminal output has no
snapshot. Raw results never cross Renderer IPC.

Persist CLI user/context, assistant and tool messages through the shared Chat
pipeline in the selected profile. CLI audit metadata is computed from that exact
prepared request. Batch source cli follows noninteractive tool availability;
ask_user_question is excluded. Explicit CLI thinking/prompt choices and configured
provider capabilities continue to apply.

CLI retains redacted versioned JSONL and atomic result/transcript files, immediate
deny/auto approval and exit codes 0/1/2/124/130/143. RunManager owns both parent
and child approval/cancellation bridges, including prepared specifications for
CLI-only models. CLI transport failure cancels the common run, retains terminal
evidence where available, and returns failure.

Batch CLI disables title/background compression jobs to preserve one-task call
and exit boundaries. Runtime context budgeting/compression remains shared.
Interactive hosts keep their existing post-run jobs. Subagent child sessions keep
their own supervised service lifecycle; they are not independent user ingress.

## Consequences and verification

CLI and interactive hosts share one lifecycle and execution composition root.
Host output and batch policy remain explicit. CLI chats now retain complete
messages in the profile, which increases stored transcript data; no migration or
historical backfill is required. Existing JSONL envelope and artifact schemas stay
at version 1; the audit profile is cli-chat-profile-v3.

Verify shared lifecycle and preparation tests, CLI failure/exit/artifact tests,
Main boundaries and documentation paths, Node typecheck, full Vitest coverage,
and the isolated Electron verify:cli stub acceptance. Stub acceptance covers
persistence/context snapshots, long text, tools, configured vision, thinking
continuations, budgets, cancellation and redaction. Real paid providers and other
operating systems require separate acceptance.

Local verification on macOS (2026-10-29): `pnpm run typecheck`,
`pnpm exec electron-vite build`, `pnpm test:coverage` (3022 passed, 37 skipped),
`pnpm run check:main-boundaries`, `pnpm run check:main-doc-paths`,
`pnpm run test:main-architecture`, `pnpm verify:cli` and `pnpm verify:tui` passed.
CLI/TUI used deterministic local HTTP stubs and isolated temporary profiles.
The TUI history assertion was updated for persisted request-context snapshots;
its old exact-text assertion also failed against an isolated unchanged HEAD build.
ESLint on touched files retains baseline errors (117); a HEAD comparison with the
formatting rule disabled found no added errors. Formatting warnings remain.
Real paid providers, Telegram network delivery and Windows/Linux were not exercised.
