# 0022: Interactive terminal host

Status: Accepted
Date: 2026-09-05

## Context

The existing Electron CLI serves batch JSONL automation. Interactive use needs a
persistent transcript, editing, human tool interactions, steering and follow-up
queues. Reimplementing the agent loop would duplicate Chat's request preparation,
persistence and cancellation contracts.

## Decision

Add an Electron TUI entry and reuse Chat RunService directly. TuiSession owns
terminal session selection and input routing; hosts/tui projects run events and
renders them. The shared interactive-source predicate includes desktop and `tui`
for question availability and runtime handlers. Batch CLI behavior stays under
its existing orchestrator.

Use the published `@earendil-works/pi-tui@0.83.0` for rendering, input, width,
focus and terminal restoration. Keep it external to the Vite bundle so package
resource and native-module loading resolve correctly. Its published concrete
`TUI` API differs from the same-version local research checkout; integration
follows the installed package.

Persist messages using Chat storage. Store terminal drafts and pending input in
existing configs keys `tui:input:<chatUuid>` at orderly close/session switch.
Recovered queue entries require explicit resubmission. Display trimming affects
only the terminal projection; model context and database history retain their
existing owners.

On exit, cancel and await the current run, await post-run jobs and tool-result
compaction, clean command processes, then close MCP/database/logging. Restore the
terminal even when the exit path fails.

## Consequences

TUI receives Chat's configured tools, prompts, skills, MCP and history without a
second agent kernel or database schema. New shared runtime behavior remains
testable through the existing Chat suites. Terminal-specific state remains
small and independently testable.

TUI depends on the Electron runtime and an interactive terminal. It currently
ships as a repository command, not a separately packaged executable. Normal
exit persists drafts; force-kill recovery is limited to the last save. Windows
and real IME behavior need platform acceptance beyond the macOS PTY harness.

## References

- [TUI guide](../guides/development/ati-tui.md)
- [Kimi / Pi source study](../reference/terminal/kimi-pi-tui-study.md)
- [Main-process architecture](../architecture/main-process-architecture.md)
- [CLI Host boundary](0018-electron-cli-host-boundary.md)
