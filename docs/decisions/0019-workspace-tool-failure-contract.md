# ADR-0019: Workspace tool failure contract

**Status:** Accepted<br>
**Date:** 2026-09-03<br>
**Related architecture:** [Main process architecture](../architecture/main-process-architecture.md), [Sandbox system design](../architecture/sandbox-design.md#workspace-file-operation-confinement)<br>
**Related decision:** [Workspace path confinement](0008-workspace-path-confinement.md)

## Context

Tool processors currently return a mixture of boolean results, compatibility
error text, command facts, and thrown exceptions. The runtime can transport
those values successfully while losing the reason a tool operation failed.
That makes input errors, workspace policy failures, environment failures, and
internal faults indistinguishable to the next model request.

The runtime also needs to preserve command timeout, signal termination, and
user cancellation as separate facts. Existing lifecycle statuses and result
fields already have consumers, so the new contract must travel alongside them.

## Decision

Define the serializable `ToolFailure` contract in
`src/shared/tools/toolFailure.ts`:

- `category` is `input`, `policy`, `operation`, `environment`, or `internal`.
- `code` is a stable machine-readable reason such as
  `PATH_OUTSIDE_WORKSPACE`, `FILE_NOT_FOUND`, `COMMAND_NONZERO_EXIT`, or
  `COMMAND_SPAWN_FAILED`.
- `message` is a safe fact and explanation suitable for model and runtime
  consumption.
- `recovery` contains an action (`correct_input`, `change_strategy`,
  `check_environment`, `check_state`, `limited_retry`, or `stop`) and a short
  instruction.
- `termination`, when present, records `timeout`, `signal`, or `cancelled`.
- `sourceCode`, when present, preserves a confirmed operating-system error
  code such as `ENOENT` or `EACCES`.

Processors add `failure` beside existing `success`, `status`, `error`, and
command output fields. The executor classifies thrown errors before wrapping
them in `ToolExecutionError`, while explicit processor failures retain their
category and code. Model argument parsing marks only the parameter parser's
own error as input; unrelated `SyntaxError` values remain internal failures.
Approval denial and confirmation cancellation keep their existing lifecycle
statuses and receive distinct policy failure codes. Timeout and signal
responses keep their existing command facts and receive distinct termination
values.

The field is preserved through `ToolExecutor`,
`ToolExecutorDispatcher`, `ToolResultFact`, transcript materialization, model
request content, and chat render events. Result projection places a structured
failure before large or cold-replayed content so normalization cannot hide the
reason. MCP or third-party payloads are inspected only through the registered
embedded-tool contract.

Workspace-contained file tools accept native absolute paths inside the active
workspace and normalize their response paths. Relative-only consumers such as
vision and workspace web artifact paths retain their existing contracts. The
path boundary and canonical symlink rules remain those defined by ADR-0008.

## Consequences

- The model receives stable category, code, message, and recovery information
  for tool failures while existing compatibility fields remain available.
- Runtime and transcript consumers can distinguish policy, operation,
  environment, and internal failures without parsing human-facing strings.
- Timeout, signal termination, and user cancellation remain separate facts and
  preserve their existing lifecycle handling.
- Command exit code, signal, stdout, stderr, file-system errno, and existing
  error text remain available for diagnosis.
- Failure classification does not add automatic retry behavior or alter
  security authorization decisions.

The contract is a transport and classification boundary. It does not remove
the operating-system TOCTOU risks documented by ADR-0008, and it does not
replace command-specific interpretation of non-zero exits.

## Verification

- Unit coverage exercises invalid model JSON, unknown internal exceptions,
  file operation failures, command non-zero exits, spawn errno, timeout,
  approval denial, and cancellation.
- Integration coverage sends real file processor failures through executor,
  dispatcher, transcript record creation, and request materialization without
  making model API calls.
- Large result normalization and cold replay retain the structured failure at
  the start of model-visible content.
- The implementation guide records the exact test and architecture gate
  commands used for this change.
