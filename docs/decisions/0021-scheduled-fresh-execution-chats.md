# ADR-0021: Fresh execution chats for scheduled attempts

**Status:** Accepted<br>
**Date:** 2026-09-03<br>
**Related architecture:** [Scheduled task architecture](../architecture/scheduled-tasks.md)<br>
**Related implementation guide:** [Schedule fresh chat implementation](../guides/development/schedule-fresh-chat-implementation.md)

## Context

Scheduled tasks used the source conversation as the runtime chat. That mixed
task management state, source history, and every scheduled result into one
transcript. Retries also reused the same runtime identity, which made their
renderer state and persisted ownership ambiguous.

## Decision

Each once or cron occurrence attempt creates a new empty chat before invoking
`RunService`. The scheduled task keeps `chat_uuid` pointing at the source chat
for create, list, update, and cancel authorization. A nullable
`scheduled_task_runs.execution_chat_uuid` stores the current bound chat, while
`scheduled_task_run_attempts` records every `(run_id, attempt, submission_id,
chat_uuid)` association with a unique occurrence/attempt key.
Starting a new attempt clears the current chat field while retaining the
preceding attempts' associations.

The new chat is constructed from an explicit field list. It receives a fresh
UUID, empty messages and session instruction, the resolved model, a short
goal/time/attempt title, the source workspace, and the normalized source
permission mode. Source history, summaries, attachments, skills, fork data,
and host bindings remain absent. A cancellation check follows workspace
creation, and conditional binding must still observe a running occurrence
before model execution. One SQLite transaction inserts the chat, records the
attempt association, and updates the occurrence's current chat. Binding errors
roll back all three writes. Events and model execution follow the commit;
bound execution chats follow ordinary chat lifecycle controls.

Schedule control events continue to target the source chat for task updates.
Execution and message events target the fresh chat. The renderer binds the
normal run event stream after `schedule.started`, updates the background list
with `selectShell: false`, and scopes run phases, previews, messages, and
terminal cleanup by execution chat UUID. The stable occurrence ID remains the
native notification deduplication key across retries.
Occurrence completion retains any pending compression subscription so normal
maintenance events can finish the chat lifecycle.

## Consequences

- Scheduled results are independently browsable and follow-up prompts do not
  add context from the source transcript.
- Retry attempts have distinct chat and submission identities while occurrence
  history remains queryable and bounded by the existing 100-run retention.
- The database gains one nullable column and a small association table with
  idempotent initialization; existing schedule, chat, and message rows remain
  readable.
- The renderer owns more than one background run binding and must retain those
  bindings across selected-chat changes.

## Verification

Focused scheduler, DAO, schema upgrade, schedule-tool, IPC, and renderer tests
cover fresh identities, retry associations, cancellation windows, list
visibility, and run-event cleanup. Electron SQLite verification is required for
the migration and association cascade paths.
