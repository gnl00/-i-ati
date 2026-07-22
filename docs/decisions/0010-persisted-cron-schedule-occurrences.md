# ADR-0010: Persisted cron schedule occurrences

**Status:** Accepted<br>
**Date:** 2026-07-22<br>
**Related architecture:** [Scheduled task architecture](../architecture/scheduled-tasks.md)

## Context

Scheduled tasks originally stored one execution state directly on the plan
row. Recurring schedules need an enduring definition, one independently
claimable occurrence, occurrence-scoped retries, and a stable completion event
while the parent schedule advances to its next time.

## Decision

`scheduled_tasks` stores the schedule definition and its current summary.
`scheduled_task_runs` stores persisted occurrences. A partial unique index
allows one `pending` or `running` occurrence per task. SQLite conditional
updates provide the atomic claim boundary.

Recurring expressions use `cron-parser`. The external contract accepts five
fields at minute precision plus a required IANA timezone. The calculator adds
the seconds field `0` and enables strict parsing. Day-of-month and day-of-week
cannot both carry specific values. Aliases and `H`, `L`, and `#` extensions are
future contract additions.

Each completed occurrence advances from the current wall clock to one future
occurrence. This run-once coalescing policy turns any offline interval into one
overdue execution followed by the next future execution. A busy chat defers the
occurrence by 30 seconds without consuming an attempt.

Retries belong to the occurrence. Backoff starts at 30 seconds, doubles per
attempt, and caps at 15 minutes. Exhausted recurring occurrences finish as
failed and the parent advances. The renderer consumes
`schedule.run_finished` for run-phase cleanup and notifications.

Spring-forward local times follow `cron-parser` behavior. For example,
`30 2 * * *` in `America/New_York` on 2026-03-08 runs at the first valid local
time, 03:30 EDT (`07:30Z`).

## Consequences

- Schedule definitions retain next-run and last-run summaries for fast UI reads.
- Occurrence rows provide durable retries, cancellation identity, and history.
- Each task retains its latest 100 terminal occurrences.
- Recovery marks interrupted occurrences failed and advances recurring definitions.
- The new schema and tool contract form one fresh storage generation. Startup
  resets an earlier `scheduled_tasks` table when `schedule_type` is absent.

## Verification

- Cron parsing covers field count, timezone, strict day fields, and DST.
- DAO integration covers conditional claim, running cancellation, and history retention.
- Scheduler tests cover one-time completion, recurring advancement, chat deferral,
  retry backoff, and exhausted recurring occurrences.
- Renderer tests cover occurrence-driven run-phase cleanup.
