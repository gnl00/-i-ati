# Scheduled task architecture

Status: Current<br>
Owner: Main process and chat renderer maintainers<br>
Last verified: 2026-09-03<br>
Related decisions: [ADR-0010](../decisions/0010-persisted-cron-schedule-occurrences.md), [ADR-0021](../decisions/0021-scheduled-fresh-execution-chats.md)

## Data model

```text
schedule action=create / action=update
  -> CronScheduleCalculator
  -> planningDb facade
  -> scheduled_tasks 1 ---- N scheduled_task_runs 1 ---- N scheduled_task_run_attempts
                               |                            |
SchedulerService timer --------+                            +-> fresh execution chat
  -> atomic claim -> attempt -> chat bind -> RunService -> run events
                                                            +-> chat renderer
```

`scheduled_tasks` owns the user-facing definition: `once` or `cron`, goal,
payload, timezone, expression, next wake time, status, retry limit, last-run
summary, and run count. `scheduled_task_runs` owns an occurrence's scheduled
time, retry wake time, claim state, attempt count, submission identity, result,
error, and `execution_chat_uuid`. `scheduled_task_run_attempts` preserves each
attempt's submission and execution chat association under the stable occurrence
ID. The association table has a unique `(run_id, attempt)` key and cascades
when an occurrence is trimmed or its task is deleted.

A new attempt clears `execution_chat_uuid` before preparation; prior attempt
associations remain queryable. The nullable column and association table are
added idempotently to the current occurrence schema while preserving its rows.

This feature starts a fresh storage generation. Database initialization detects
the earlier table shape through the absence of `schedule_type`, removes the old
schedule tables, and creates the definition-and-occurrence schema.

The database enforces unique `(task_id, scheduled_for)` identity and one active
occurrence per task. A due claim changes the occurrence from `pending` to
`running` inside a SQLite transaction. The parent enters `running` in the same
transaction.

## Cron contract

The tool accepts standard five-field expressions:

```text
minute hour day-of-month month day-of-week
```

Cron schedules require an IANA timezone. The calculator prefixes seconds with
`0` and uses `cron-parser` strict mode. Expressions use minute precision.
Day-of-month and day-of-week share strict exclusive specificity. Numeric cron
syntax, ranges, lists, and steps form the active grammar.

One-time creation uses `goal + run_at`, with `run_at` expressed as ISO-8601
including `Z` or a numeric timezone offset. Recurring creation uses
`goal + cron_expression + timezone`. Updates preserve the schedule type and
atomically replace its pending occurrence. Creation and updates wake the
scheduler so its due timer tracks the new earliest time immediately.

## Execution lifecycle

The scheduler keeps a fallback interval, an exact next-due timer, and an
in-process `isTicking` guard. SQLite remains the cross-caller claim authority.

1. Claim up to five due occurrences.
2. Assign a submission ID and increment the occurrence attempt.
3. Resolve the current source chat and execution model.
4. Validate the final instruction and model reference, prepare the workspace,
   recheck the source settings, and atomically insert an empty execution chat
   with its attempt association and current run chat reference.
5. Execute through `RunService` with `source: schedule` and the execution chat identity.
6. Finish the occurrence and update the source task summary.
7. For cron, calculate one occurrence strictly after the current wall clock.

This produces run-once misfire coalescing after offline periods. The first
persisted overdue occurrence runs once; the following occurrence lies in the
future.

Failures retry after 30, 60, 120 seconds and continue doubling to a 15-minute
cap. `max_attempts` counts total attempts for each occurrence. A final one-time
failure closes its parent. A final recurring failure records the failed run and
advances its parent.

Every occurrence attempt creates a new chat after its attempt row is started.
The source chat supplies the current workspace and normalized permission mode;
the new chat stores the resolved model, an empty transcript and session
instruction, and a short goal/time/attempt title. Source history, summaries,
attachments, skills, fork metadata, and host bindings remain outside the
execution chat. Cancellation detected during workspace preparation prevents
chat allocation. Chat insertion and attempt binding share one SQLite
transaction; errors roll back the entire operation. A bound execution chat
remains available through normal chat lifecycle controls, including when
cancellation arrives before model output.

Prompt, model reference, and effective instruction validation precede chat
allocation. After asynchronous workspace preparation, the scheduler verifies
that the source chat still exists with the same workspace and permission mode;
changes settle through the normal failure and retry policy.

## Cancellation and recovery

Cancellation updates the parent and active occurrence transactionally. A
running occurrence exposes its persisted `submission_id` to
`RunService.cancel()`. The execution finalizer reads the parent again before a
success write, preserving cancellation as the terminal authority. Cancellation
during workspace creation is checked after the await and again by the
conditional attempt bind, so a cancelled run cannot start a fresh model
execution.

Application startup scans `running` occurrences. Recovery records them as
failed with `Interrupted by application restart`. One-time parents finish as
failed. Recurring parents receive one next future occurrence. This policy
prioritizes avoiding duplicated external side effects.

## Events and renderer

- `schedule.started` carries the source task, occurrence, submission ID, attempt,
  and execution chat entity. Its envelope targets the execution chat.
- `schedule.run_finished` carries the terminal occurrence and current parent;
  its envelope targets `run.execution_chat_uuid`, with source-chat fallback for
  legacy runs.
- `schedule.updated` targets the source chat and refreshes the plan board
  definition.
- message events target the execution chat and deliver its persisted messages.

The renderer binds the normal run event stream after `schedule.started`, routes
messages and lifecycle state by execution chat UUID, and applies the execution
chat to the background chat list without changing the selected shell. Normal
run terminal events clear each attempt, including retryable failures. The task
board keeps source-chat ownership and labels recurring definitions with
expression, timezone, next run, and last-run status.

Occurrence completion preserves subscriptions while blocking compression is
pending. The normal maintenance completion event settles the chat phase;
background title updates retain their own subscription until completion.

## Native notifications

Scheduled executions enter the main-agent runtime with `source: schedule`.
`DefaultMainAgentRuntimeRunner` registers `AgentNotificationSink` for scheduled
and interactive desktop runs. Telegram and other host sources retain their
host-owned notification paths.

The sink consumes one agent-loop terminal event. `loop.completed` produces a
completion notification; `loop.failed` produces a failure notification when
the current attempt exhausts the occurrence retry budget. `SchedulerService`
passes `nativeNotification.notifyOnFailure: false` for retryable attempts and
`true` for the final attempt. A successful attempt always produces the
completion notification. This gives each occurrence at most one native
notification across all retries. Every attempt carries the stable occurrence
run ID as `occurrenceKey`; the sink keeps a bounded 1000-key process-local
deduplication set for cross-attempt and repeated terminal delivery.

Failures can also settle before the agent loop starts. Missing chats, unresolved
models, and chat preparation errors reach `SchedulerService` before
`DefaultMainAgentRuntimeRunner` creates its event sink. On the final attempt,
the scheduler calls the notification module's direct terminal-failure entry
with the same occurrence key. The direct entry shares foreground gating,
deduplication, native display, badge, strong-reference, and click-to-focus
behavior with `AgentNotificationSink`.

The fallback is limited to execution attempts that have not returned
successfully. An explicit execution-settled flag keeps later cron calculation
and persistence errors on the scheduler state path without presenting them as
agent execution failures. Startup recovery continues through persisted
occurrence state and schedule events.

Foreground gating keeps visible, focused sessions on the existing renderer
feedback path. Background, minimized, and unfocused sessions receive the native
notification with summary text, badge increment, and click-to-focus behavior.
Streaming message updates remain on the renderer event path.

## Operational data

Scheduler control-plane logs route through `createSchedulerLogger()` into
`scheduler-YYYY-MM-DD.log`. Every task keeps its latest 100 terminal occurrence
rows. The task row provides the efficient board projection; occurrence history
remains available through the planning database facade.
