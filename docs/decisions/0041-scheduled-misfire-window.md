# ADR-0041: Scheduled task misfire window

**Status:** Accepted<br>
**Date:** 2026-10-05<br>
**Related architecture:** [Scheduled tasks](../architecture/scheduled-tasks.md)<br>
**Supersedes:** the offline run-once policy in [ADR-0010](0010-persisted-cron-schedule-occurrences.md)

## Context

Claims accepted any overdue pending occurrence. Each attempted execution and
retry creates its own chat, so offline tasks could allocate stale `NewChat`
entries. Claiming five rows before serial execution also allowed later rows to
age while waiting for an earlier model run.

## Decision

Use a fixed 15-minute grace window on `next_attempt_at`, inclusive of its lower
boundary, at the SQLite claim authority. Before the first startup claim and
every later claim, reconcile pending rows. Unattempted cron rows fold to the
latest due cron time; retain that time only within grace, otherwise schedule
the next future time. Do not enumerate missed slots. Claim one row at a time,
with up to five serial executions per tick.

Persist `skipped` as a terminal occurrence status. Finishing an old row and
inserting its replacement are atomic. One-time parents become `skipped`; cron
parents remain pending with one replacement. Keep skip reasons in the existing
error field and include skipped rows in the latest 100 terminal occurrences.
This uses existing TEXT status columns and requires no schema migration.

Retries use their backoff deadline for grace. Preserve on-time retries and
their original occurrence identity; overdue cron retries fold to a newer due
time within grace, or advance to the future. Existing attempt and execution-chat
associations survive skipping. Retryable failures update the parent's latest
failure summary while the terminal occurrence count remains unchanged.
Interrupted running rows retain the existing failed-on-restart policy.

Reverse cron parsing differs from forward parsing around DST gaps and folds.
On offset-transition days, find the latest time with a single forward iterator
from local midnight, bounded to that day's minute slots. Other days use `prev()`.
Invalid persisted cron definitions fail independently during reconciliation.

Register Electron's system resume event after scheduler startup and dispose
the handler during application shutdown. Resume uses the ordinary wake path.

## Consequences

- Offline reminders older than grace expire; users can inspect the skip reason.
- Recent cron reminders run once using the latest scheduled time.
- Skipping allocates no attempt/chat and produces no native failure alert.
- Existing empty chats remain under normal chat lifecycle controls.
- Reconciliation scans persisted tasks before each of at most five claims;
  indexed due-row batching can replace this scan if task volume requires it.

## Verification

- Regression tests first fail on stale one-time tasks, cron folding, overdue
  retries and tasks aging during serial execution, then pass after the fix.
- Native SQLite checks cover grace boundaries, fresh retries, conditional skip,
  replacement rollback, association retention and bounded skipped history.
- Application lifecycle tests cover resume wake and listener removal.
- Task board tests cover Skipped history, dismissal and recurring skip reasons.
