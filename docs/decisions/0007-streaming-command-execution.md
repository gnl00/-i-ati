# ADR-0007: Streaming command execution

**Status:** Accepted<br>
**Date:** 2026-07-20<br>
**Related architecture:** [Sandbox system design](../architecture/sandbox-design.md)

## Context

Electron inherits the environment available to the desktop process. The command
tool enriches that environment with the user's login-shell `PATH`, then executes
commands for the main agent, subagents, direct IPC callers, and skill scripts.

The previous executor used `exec` and `execFile`. Both APIs buffered complete
stdout and stderr values before resolving. Long-running commands therefore
provided terminal feedback only, and retained output grew with the child
process output.

The chat runtime already projects tool lifecycle facts through:

```text
ToolExecutor
  -> AgentEvent
  -> HostRenderEvent
  -> RunEvent
  -> renderer
```

Ordinary run events are persisted as trace records. Command output can arrive
many times per second, so it needs a bounded, ephemeral transport class.

## Decision

### Process execution

Use a shared spawn-based command runner.

- Direct executable commands use `spawn(executable, argv)` with shell mode
  disabled.
- Skill scripts resolve their canonical target inside the selected skill root,
  then use an internal executable/argv invocation after trusted tool-metadata
  approval reaches the processor through the execution context.
- Shell expressions invoke an explicit platform shell with its command
  argument.
- stdout and stderr are decoded incrementally with a multibyte-safe decoder.
- Each final stream keeps a bounded 512 KiB head-and-tail capture.
- Results include observed byte counts, truncation flags, exit code, termination
  signal, and execution time.
- Abort and timeout share one termination path.
- Timeout inputs are normalized to a finite integer from 1 ms through 24 hours.
- POSIX children run in their own process group. Termination sends `SIGTERM`,
  waits for a short grace period, then sends `SIGKILL` to the original process
  group. This cleanup lease survives leader `close` and result settlement, so a
  descendant that ignores `SIGTERM` still receives the delayed escalation.
- The delayed POSIX escalation targets the negative process-group ID only.
  `ESRCH` records an already-clean process group. The delayed path stays
  group-scoped because the operating system may reuse the original leader PID
  after `close`.
- Windows termination invokes the system `taskkill.exe` for the child process
  tree, falls back to killing the direct child when taskkill fails, and applies
  a final seven-second settlement deadline. The spawned taskkill process owns
  its completion independently after the command leader closes.
- stdin starts closed. Interactive terminal execution remains a separate
  capability.

The runner accepts an optional execution context:

```ts
type EmbeddedToolExecutionContext = {
  signal?: AbortSignal
  metadataConfirmationApproved?: boolean
  onOutput?: (chunk: {
    stream: 'stdout' | 'stderr'
    text: string
  }) => void
}
```

`metadataConfirmationApproved` is internal provenance. `ToolExecutor` sets it
after metadata review or trusted auto approval; model arguments never populate
the field.

The embedded tool registry keeps this context optional, preserving direct
single-argument handler calls. `execute_command` and `run_skill_script` forward
the context to the shared runner.

### Live output transport

The command runner reports decoded chunks to `ToolExecutor`. `ToolExecutor`
emits at most one output batch every 100 ms. Pending stdout and stderr each keep
a 32 KiB tail, giving the event queue a fixed 64 KiB staging budget. A batch
records:

- the observed stdout/stderr chunks;
- a monotonic sequence;
- cumulative stdout/stderr byte counts.

High-throughput commands can replace older text inside the current staging
window. The cumulative byte counters continue to describe all observed output,
and the terminal command result retains its independent 512 KiB head-and-tail
capture.

Tool output follows the runtime and host event chain as an execution-progress
fact. The corresponding `tool.execution.output` run event is ephemeral:

- it is delivered to renderer IPC and registered runtime sinks;
- it advances the normal run-event sequence;
- it skips the database run-event trace.

Terminal lifecycle events and the bounded command result retain their existing
durable behavior.

### Renderer ownership

The renderer stores live output in a transient map keyed by chat and tool-call
identity.
Each stream keeps a 64 KiB tail. The tool-result panel subscribes to its current
entry and displays live stdout/stderr in the Results view while execution is
active. Carriage-return progress updates replace the current rendered line.

Terminal completion, failure, abort, and run cleanup remove the transient
entry for the matching submission. Persisted message segments continue to hold
the final tool result.

Desktop chat consumes live output. Other host surfaces keep their existing
started and terminal status presentation.

## Consequences

- Large command output has a fixed retained-memory budget in the main process
  and renderer.
- `npm install`, `docker build`, `git clone`, and similar commands expose
  progress before completion.
- Cancellation reaches the child process and its process tree.
- Command results remain compatible with direct IPC and model-facing tool
  result compaction.
- Skill script execution rejects external and dangling symbolic links and
  accepts trusted confirmation only from the internal execution context.
- Live output disappears with the active run and stays outside chat replay and
  run-event trace storage.
- PTY allocation, interactive stdin, terminal emulation, and durable full-log
  artifacts remain follow-up capabilities.

## Verification

- Direct executable and shell-expression commands stream and resolve correctly.
- Split UTF-8 characters decode without replacement corruption.
- stdout and stderr captures remain bounded and report original byte counts.
- Timeout and abort preserve their process-group cleanup lease after the leader
  closes, terminate descendants after the grace period, and report terminal
  metadata.
- Delayed POSIX escalation treats `ESRCH` as successful cleanup and remains
  scoped to the original negative process-group ID.
- Invalid and out-of-range timeout inputs resolve to documented safe bounds.
- Windows taskkill startup failure reaches the direct-child fallback.
- Missing shell candidates advance to the next configured shell.
- Tool execution context reaches `execute_command` and `run_skill_script`.
- Skill script arguments retain their executable/argv boundaries.
- Skill script paths receive lexical and canonical skill-root containment.
- Model arguments and direct processor calls cannot synthesize trusted skill
  script approval.
- Output progress preserves tool-call identity and ordering through the runtime
  and host layers.
- Ephemeral output reaches IPC and sinks without a database trace write.
- Renderer tails remain bounded, normalize carriage-return progress, and clear
  on submission-scoped terminal lifecycle events.
- Existing direct IPC and terminal tool-result behavior remains stable.
