# Scheduled task architecture

Status: Current<br>
Owner: Main process and chat renderer maintainers<br>
Last verified: 2026-07-22<br>
Related decision: [ADR-0010](../decisions/0010-persisted-cron-schedule-occurrences.md)

## Data model

```text
schedule_create / schedule_update
  -> CronScheduleCalculator
  -> planningDb facade
  -> scheduled_tasks 1 ---- N scheduled_task_runs
                               |
SchedulerService timer --------+
  -> atomic claim -> RunService -> schedule.run_finished
                                      |
                                      +-> chat renderer
```

`scheduled_tasks` owns the user-facing definition: `once` or `cron`, goal,
payload, timezone, expression, next wake time, status, retry limit, last-run
summary, and run count. `scheduled_task_runs` owns an occurrence's scheduled
time, retry wake time, claim state, attempt count, submission identity, result,
and error.

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
2. Defer a busy chat by 30 seconds while retaining its attempt count.
3. Assign a submission ID and increment the occurrence attempt.
4. Execute through `RunService` with `source: schedule`.
5. Finish the occurrence and update the parent summary.
6. For cron, calculate one occurrence strictly after the current wall clock.

This produces run-once misfire coalescing after offline periods. The first
persisted overdue occurrence runs once; the following occurrence lies in the
future.

Failures retry after 30, 60, 120 seconds and continue doubling to a 15-minute
cap. `max_attempts` counts total attempts for each occurrence. A final one-time
failure closes its parent. A final recurring failure records the failed run and
advances its parent.

## Cancellation and recovery

Cancellation updates the parent and active occurrence transactionally. A
running occurrence exposes its persisted `submission_id` to
`RunService.cancel()`. The execution finalizer reads the parent again before a
success write, preserving cancellation as the terminal authority.

Application startup scans `running` occurrences. Recovery records them as
failed with `Interrupted by application restart`. One-time parents finish as
failed. Recurring parents receive one next future occurrence. This policy
prioritizes avoiding duplicated external side effects.

## Events and renderer

- `schedule.started` carries the task, occurrence, submission ID, and attempt.
- `schedule.run_finished` carries the terminal occurrence and current parent.
- `schedule.updated` refreshes the plan board definition.
- message events deliver messages created by the scheduled run.

The renderer clears chat run phase from `schedule.run_finished`, which remains
stable while a recurring parent returns to `pending`. The task board labels
recurring definitions and shows expression, timezone, next run, and last-run
status.

## Operational data

Scheduler control-plane logs route through `createSchedulerLogger()` into
`scheduler-YYYY-MM-DD.log`. Every task keeps its latest 100 terminal occurrence
rows. The task row provides the efficient board projection; occurrence history
remains available through the planning database facade.
